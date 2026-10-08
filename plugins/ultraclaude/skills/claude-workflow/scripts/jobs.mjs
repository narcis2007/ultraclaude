import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { atomicJson, ensureState, stateDirectory } from "./workspace.mjs";

const RUN_ID = /^\d{8}T\d{6}Z-[a-f0-9]{12}$/;
const terminal = new Set(["done", "failed", "cancelled", "interrupted"]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function paths(id, env = process.env) {
  if (!RUN_ID.test(id ?? "")) throw new Error("Invalid run ID.");
  const dir = path.join(stateDirectory(env), "runs", id);
  return { dir, state: path.join(dir, "state.json"), supervisor: path.join(dir, "supervisor.json"), request: path.join(dir, "request.json"), result: path.join(dir, "result.json"), cancel: path.join(dir, "cancel"), log: path.join(dir, "events.jsonl") };
}
async function json(file) { return JSON.parse(await readFile(file, "utf8")); }
async function removeOwnedSlot(directory, slotsRoot) {
  const resolved = await realpath(directory);
  if (resolved !== directory || path.dirname(resolved) !== slotsRoot || !/^[0-7]$/.test(path.basename(resolved))) throw new Error("Invalid slot cleanup target.");
  await rm(resolved, { recursive: true, force: true });
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; } }

export async function startJob(raw, validate, options = {}) {
  const normalized = validate(raw);
  const root = await ensureState(options.env);
  const id = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z-${randomBytes(6).toString("hex")}`;
  const files = paths(id, options.env);
  await mkdir(files.dir, { recursive: true, mode: 0o700 });
  // Operator-only launcher configuration is carried separately from the untrusted request.
  await atomicJson(files.request, { raw, claudePath: options.claudePath ?? null });
  const state = { runId: id, state: "queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), cwd: normalized.cwd,
    mode: normalized.mode ?? "review", model: normalized.model ?? null, effort: normalized.effort ?? null, supervisorPid: null, childPid: null };
  await atomicJson(files.state, state);
  const script = fileURLToPath(new URL("claude-node.mjs", import.meta.url));
  const env = { ...(options.env ?? process.env), ULTRACLAUDE_STATE_DIR: root };
  let supervisorPid;
  try { supervisorPid = await new Promise((resolve, reject) => {
    const supervisor = spawn(process.execPath, [script, "supervise", id], { cwd: normalized.cwd, env, windowsHide: true, detached: true, stdio: "ignore" });
    supervisor.once("error", reject);
    supervisor.once("spawn", () => { supervisor.unref(); resolve(supervisor.pid); });
  }); } catch (error) {
    await atomicJson(files.result, { ok: false, runId: id, error: { kind: "spawn", message: error.message, retryable: false } });
    await atomicJson(files.state, { ...state, state: "failed", finishedAt: new Date().toISOString() });
    return { ok: false, runId: id, state: "failed", error: { kind: "spawn", message: error.message, retryable: false } };
  }
  // Separate provenance survives a supervisor that exits before its first state write.
  await atomicJson(files.supervisor, { pid: supervisorPid });
  // The supervisor is the only state writer after spawn, preventing start/finish races.
  for (let i = 0; i < 50; i++) {
    const current = await json(files.state);
    if (current.supervisorPid || terminal.has(current.state)) return { ok: true, runId: id, state: current.state, next: `wait ${id}` };
    await sleep(20);
  }
  return { ok: true, runId: id, state: "queued", next: `status ${id}` };
}

async function acquireSlot(id, files, env) {
  const slots = path.join(await ensureState(env), "slots");
  await mkdir(slots, { recursive: true, mode: 0o700 });
  const configured = Number(env.ULTRACLAUDE_MAX_CONCURRENT ?? 2);
  if (!Number.isInteger(configured) || configured < 1 || configured > 8) throw new Error("ULTRACLAUDE_MAX_CONCURRENT must be 1..8.");
  while (true) {
    try { await stat(files.cancel); return null; } catch (error) { if (error.code !== "ENOENT") throw error; }
    for (let index = 0; index < configured; index++) {
      const directory = path.join(slots, String(index));
      try {
        await mkdir(directory, { mode: 0o700 });
        await atomicJson(path.join(directory, "owner.json"), { pid: process.pid, runId: id });
        return directory;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          const owner = await json(path.join(directory, "owner.json"));
          if (Number.isInteger(owner.pid) && owner.pid > 0 && !alive(owner.pid)) await removeOwnedSlot(directory, slots);
        } catch { /* An in-progress claim is never reclaimed. */ }
      }
    }
    await sleep(200);
  }
}

export async function superviseJob(id, execute, env = process.env) {
  const files = paths(id, env);
  let state = await json(files.state), slot, poll;
  const save = async values => { state = { ...state, ...values, updatedAt: new Date().toISOString() }; await atomicJson(files.state, state); };
  // Serialize state writes from process callbacks so progress cannot overwrite completion.
  let pending = Promise.resolve();
  const update = values => { pending = pending.then(() => save(values)); };
  const controller = new AbortController();
  try {
    await save({ supervisorPid: process.pid });
    slot = await acquireSlot(id, files, env);
    if (!slot) controller.abort();
    const config = await json(files.request);
    if (!controller.signal.aborted) await save({ state: "running", startedAt: new Date().toISOString() });
    poll = setInterval(() => {
      stat(files.cancel).then(() => controller.abort()).catch(() => {});
    }, 150);
    const result = controller.signal.aborted ? { ok: false, error: { kind: "cancelled", message: "Cancelled before execution.", retryable: false } } :
      await execute(config.raw, {
        env, claudePath: config.claudePath, signal: controller.signal, runId: id,
        onSpawn: pid => update({ childPid: pid }),
        onWorkspace: workspace => update({ workspace }),
        onEvent: event => {
          const safe = { at: new Date().toISOString(), type: event.type ?? null, subtype: event.subtype ?? null,
            model: event.message?.model ?? event.model ?? null };
          update({ lastEvent: safe });
          pending = pending.then(() => writeFile(files.log, JSON.stringify(safe) + "\n", { flag: "a", mode: 0o600 }));
        },
      });
    await pending;
    await atomicJson(files.result, { ...result, runId: id });
    await save({ state: result.ok ? "done" : result.error?.kind === "cancelled" ? "cancelled" : "failed", childPid: null, finishedAt: new Date().toISOString() });
  } catch (error) {
    await pending.catch(() => {});
    await atomicJson(files.result, { ok: false, runId: id, error: { kind: "execution", message: error.message, retryable: false }, workspace: state.workspace ?? null });
    await save({ state: "failed", childPid: null, finishedAt: new Date().toISOString() });
  } finally {
    clearInterval(poll);
    if (slot) {
      const owner = await json(path.join(slot, "owner.json")).catch(() => null);
      if (owner?.runId === id && owner.pid === process.pid) await removeOwnedSlot(slot, path.join(stateDirectory(env), "slots"));
    }
  }
}

export async function jobStatus(id, env = process.env) {
  if (!id) {
    const root = path.join(stateDirectory(env), "runs");
    const names = await readdir(root).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error));
    const states = await Promise.all(names.filter(name => RUN_ID.test(name)).map(name => jobStatus(name, env)));
    return { ok: true, runs: states.map(item => item.run) };
  }
  const files = paths(id, env);
  const run = await json(files.state);
  const supervisorPid = run.supervisorPid ?? (await json(files.supervisor).catch(() => null))?.pid;
  if (!terminal.has(run.state) && supervisorPid && !alive(supervisorPid)) {
    return { ok: true, run: { ...run, state: "interrupted", reason: "Supervisor is no longer running. Inspect the workspace; other processes were not killed." } };
  }
  return { ok: true, run };
}
export async function jobResult(id, env = process.env) {
  const status = await jobStatus(id, env);
  if (!terminal.has(status.run.state)) return { ok: true, runId: id, state: status.run.state, pending: true };
  try { return await json(paths(id, env).result); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { ok: false, runId: id, workspace: status.run.workspace ?? null, error: { kind: "interrupted", message: "The supervisor exited without a result; inspect partial changes.", retryable: false } };
  }
}
export async function waitJob(id, seconds = 10, env = process.env) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30) throw new Error("max-wait must be between 0 and 30 seconds.");
  const deadline = Date.now() + seconds * 1000;
  while (true) {
    const result = await jobResult(id, env);
    if (!result.pending || Date.now() >= deadline) return result;
    await sleep(Math.min(150, Math.max(1, deadline - Date.now())));
  }
}
export async function cancelJob(id, env = process.env) {
  const status = await jobStatus(id, env);
  if (terminal.has(status.run.state)) return { ok: true, runId: id, state: status.run.state, cancelled: false };
  await writeFile(paths(id, env).cancel, "cancel\n", { mode: 0o600 });
  return { ok: true, runId: id, state: status.run.state, cancellationRequested: true };
}
