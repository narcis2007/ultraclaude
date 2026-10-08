import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, stat, writeFile, unlink, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function stateDirectory(env = process.env) {
  return path.resolve(env.ULTRACLAUDE_STATE_DIR ?? path.join(os.homedir(), ".ultraclaude"));
}
export async function ensureState(env = process.env) {
  const root = stateDirectory(env);
  await mkdir(root, { recursive: true, mode: 0o700 });
  // lstat, not a realpath comparison: a Windows 8.3 short name (C:\Users\RUNNER~1\...) or a linked
  // parent makes realpath differ for a real directory. Node reports junctions as symbolic links.
  // The canonical path is returned, so paths derived from it (leases, slots) equal their realpath.
  const info = await lstat(root);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("State directory must not be a symlink or junction.");
  return await realpath(root);
}
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  // Windows readers can briefly hold the destination without delete sharing.
  for (let attempt = 0; ; attempt++) {
    try { await rename(temporary, file); break; }
    catch (error) {
      if (attempt >= 20 || !["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
}
export function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}
export function scopeDigest(request) {
  return createHash("sha256").update(JSON.stringify({
    cwd: request.cwd, mode: request.mode, execution: request.execution,
    allowedPaths: request.allowedPaths, shellCommands: request.shellCommands,
    networkDomains: request.networkDomains,
  })).digest("hex");
}
function sessionFile(root, id) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/.test(id)) throw new Error("Invalid session ID.");
  return path.join(root, "sessions", `${id}.json`);
}
export async function sessionFor(request, env = process.env) {
  if (!request.resumeSessionId) return null;
  let record;
  try { record = JSON.parse(await readFile(sessionFile(stateDirectory(env), request.resumeSessionId), "utf8")); }
  catch { throw new Error("Unknown session: only sessions registered by Ultraclaude may be resumed."); }
  const canonical = await realpath(request.cwd);
  if (canonical !== record.cwd || scopeDigest({ ...request, cwd: canonical }) !== record.scopeDigest) {
    throw new Error("Session project or permissions differ from the original run; create a new session instead.");
  }
  if (record.workspace?.directoryIdentity && JSON.stringify(await directoryIdentity(canonical)) !== JSON.stringify(record.workspace.directoryIdentity)) {
    throw new Error("Session workspace was replaced; create a new session instead.");
  }
  if (record.workspace?.gitCommonDir) {
    const common = await realpath(path.resolve(canonical, await git(canonical, ["rev-parse", "--git-common-dir"])));
    if (common !== record.workspace.gitCommonDir) throw new Error("Session belongs to a different repository.");
  }
  return record;
}
export async function registerSession(request, result, workspace, env = process.env) {
  if (!request.persistSession || !result.sessionId) return;
  const root = await ensureState(env);
  await atomicJson(sessionFile(root, result.sessionId), {
    sessionId: result.sessionId, cwd: request.cwd, scopeDigest: scopeDigest(request),
    mode: request.mode, execution: request.execution, workspace,
    requestedModel: request.model, observedModels: result.routing?.observedModels ?? [],
    updatedAt: new Date().toISOString(),
  });
}

export async function acquireWorkspaceLease(request, env = process.env) {
  if (request.mode === "review" && !request.resumeSessionId) return async () => {};
  const cwd = await realpath(request.cwd);
  const root = await ensureState(env);
  const directory = path.join(root, "leases", createHash("sha256").update(cwd).digest("hex"));
  await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
  try { await mkdir(directory, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    let stale = false;
    try {
      const owner = JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8"));
      if (Number.isInteger(owner.pid) && owner.pid > 0) {
        try { process.kill(owner.pid, 0); } catch (problem) { stale = problem.code === "ESRCH"; }
      }
    } catch { /* A lease that is being created is never reclaimed. */ }
    if (!stale || await realpath(directory) !== directory) throw new Error("Another Ultraclaude run owns this workspace/session. Wait for it before continuing.");
    await unlink(path.join(directory, "owner.json")); await rmdir(directory);
    await mkdir(directory, { mode: 0o700 });
  }
  const ownerFile = path.join(directory, "owner.json");
  await atomicJson(ownerFile, { pid: process.pid, cwd, at: new Date().toISOString() });
  return async () => { await unlink(ownerFile); await rmdir(directory); };
}

export async function git(cwd, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", cwd, ...args], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", error = "";
    child.stdout.on("data", data => { output += data; if (output.length > 2 * 1024 * 1024) child.kill(); });
    child.stderr.on("data", data => { error += data; });
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve(output.trim()) : reject(new Error(error.trim().slice(0, 2000) || `git exited ${code}`)));
  });
}

async function directoryIdentity(cwd) {
  const info = await stat(cwd);
  return { dev: info.dev, ino: String(info.ino), birthtimeMs: info.birthtimeMs };
}
async function existingWorkspace(cwd, isolation) {
  const common = await git(cwd, ["rev-parse", "--git-common-dir"]).catch(() => null);
  return { path: cwd, isolation, directoryIdentity: await directoryIdentity(cwd),
    ...(common ? { gitCommonDir: await realpath(path.resolve(cwd, common)) } : {}) };
}

export async function prepareWorkspace(request, env = process.env, runId = randomBytes(8).toString("hex")) {
  const cwd = await realpath(request.cwd);
  if (request.resumeSessionId) {
    const session = await sessionFor({ ...request, cwd }, env);
    return { request: { ...request, cwd }, workspace: session.workspace };
  }
  if (request.mode === "review") return { request: { ...request, cwd }, workspace: await existingWorkspace(cwd, "read-only") };
  if (request.isolation === "direct") return { request: { ...request, cwd }, workspace: await existingWorkspace(cwd, "direct") };
  const repoRoot = await realpath(await git(cwd, ["rev-parse", "--show-toplevel"]));
  const status = await git(repoRoot, ["status", "--porcelain", "--untracked-files=normal"]);
  if (status) throw new Error("The source repository has uncommitted changes. Commit/stash them, or explicitly select isolation: direct; a worktree would omit those changes.");
  const baseCommit = await git(repoRoot, ["rev-parse", "--verify", `${request.baseRef ?? "HEAD"}^{commit}`]);
  const parent = await realpath(env.ULTRACLAUDE_WORKTREE_ROOT ?? path.dirname(repoRoot));
  if (isWithin(repoRoot, parent)) throw new Error("Worktree root must be outside the source repository.");
  const name = path.basename(repoRoot).replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 50);
  const worktree = path.join(parent, `${name}.claude-${runId}`);
  if (!isWithin(parent, worktree)) throw new Error("Invalid worktree target.");
  const branch = `claude/${runId}`;
  await git(repoRoot, ["worktree", "add", "-b", branch, worktree, baseCommit]);
  const subdir = path.relative(repoRoot, cwd);
  const target = await realpath(path.join(worktree, subdir));
  const common = await realpath(path.resolve(target, await git(target, ["rev-parse", "--git-common-dir"])));
  return { request: { ...request, cwd: target }, workspace: {
    path: worktree, cwd: target, isolation: "worktree", source: repoRoot,
    branch, baseCommit, gitCommonDir: common, directoryIdentity: await directoryIdentity(target),
  } };
}

export function permissionPath(value) {
  let normalized = value.replace(/\\/g, "/");
  normalized = normalized.replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
  if (/[()*,?\[\]]/.test(normalized)) throw new Error("Workspace path contains permission-pattern metacharacters; use a worktree root with a plain path.");
  return `/${normalized}`;
}
export async function validateAllowedPaths(request) {
  if (request.mode === "review") return;
  for (const relative of request.allowedPaths) {
    const target = path.resolve(request.cwd, relative);
    if (!isWithin(request.cwd, target)) throw new Error("Allowed write path escapes the workspace.");
    let ancestor = target;
    while (true) {
      try { await stat(ancestor); break; }
      catch (error) { if (error.code !== "ENOENT") throw error; ancestor = path.dirname(ancestor); }
    }
    if (!isWithin(request.cwd, await realpath(ancestor))) throw new Error("Allowed write path resolves outside the workspace through a symlink or junction.");
  }
}
export function writeRules(request) {
  return request.allowedPaths.flatMap(relative => {
    const absolute = permissionPath(path.resolve(request.cwd, relative));
    return [`Edit(${absolute})`, `Edit(${absolute}/**)`];
  });
}
export function protectedRules(request) {
  const root = permissionPath(request.cwd);
  return [".git", ".claude", ".codex", ".ultraclaude"].flatMap(name => [
    `Edit(${root}/**/${name})`, `Edit(${root}/**/${name}/**)`,
    `Edit(${root}/${name})`, `Edit(${root}/${name}/**)`,
  ]);
}
