import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// The task is not sent until a native Windows writer belongs to our Job Object.
function windowsJob(pid) {
  const helper = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
    fileURLToPath(new URL("windows-job.ps1", import.meta.url)), "-TargetProcessId", String(pid)],
  { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let message = "";
  const ready = new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), 5000);
    helper.stdout.on("data", chunk => { message += chunk; if (message.includes("READY")) { clearTimeout(timer); resolve(true); } });
    helper.once("error", () => { clearTimeout(timer); resolve(false); });
    helper.once("exit", () => { clearTimeout(timer); resolve(false); });
  });
  helper.stdin.on("error", () => {});
  let closed = false;
  return { ready, close: () => { if (!closed) { closed = true; helper.stdin.end(); } } };
}

export async function runOwnedProcess(launcher, args, options = {}) {
  const startedAt = Date.now();
  return await new Promise(resolve => {
    const stdout = [], stderr = [];
    let size = 0, timedOut = false, outputLimitExceeded = false, cancelled = false;
    let child, job, timer, forceTimer, finished = false, stopping = false, pending = "";
    let lastExit = { exitCode: null, signal: null };
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearTimeout(forceTimer);
      options.signal?.removeEventListener("abort", cancel);
      job?.close();
      resolve({ ...result, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut, outputLimitExceeded, cancelled, durationMs: Date.now() - startedAt,
        treeCleanup: process.platform === "win32" ? job ? "job-object" : "owned-pid-tree" : "process-group" });
    };
    const terminate = () => {
      if (!child || finished || stopping) return;
      stopping = true;
      job?.close();
      if (process.platform === "win32" && child.exitCode === null && child.signalCode === null) {
        // Only the live child PID held by this runner is targeted; never enumerate/kill other sessions.
        const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.on("error", () => { try { child.kill(); } catch {} });
      } else if (process.platform !== "win32") { try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill(); } catch {} } }
      if (!forceTimer) forceTimer = setTimeout(() => {
        if (process.platform !== "win32") { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
        else if (child.exitCode === null && child.signalCode === null) { try { child.kill("SIGKILL"); } catch {} }
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
        finish({ ...lastExit, spawnError: null });
      }, options.terminationGraceMs ?? 2000);
    };
    const cancel = () => { cancelled = true; terminate(); };
    if (options.signal?.aborted) { cancelled = true; finish({ exitCode: null, signal: null, spawnError: null }); return; }
    try {
      child = spawn(launcher.command, [...(launcher.argsPrefix ?? []), ...args], {
        cwd: options.cwd, env: options.env ?? process.env, windowsHide: true,
        detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) { finish({ exitCode: null, signal: null, spawnError: String(error) }); return; }
    options.onSpawn?.(child.pid);
    options.signal?.addEventListener("abort", cancel, { once: true });
    const collect = (chunks, chunk, isStdout) => {
      const buffer = Buffer.from(chunk); size += buffer.length;
      if (size > (options.maxOutputBytes ?? 4 * 1024 * 1024)) { outputLimitExceeded = true; terminate(); return; }
      chunks.push(buffer);
      if (isStdout && options.onEvent) {
        pending += buffer.toString("utf8");
        let newline;
        while ((newline = pending.indexOf("\n")) !== -1) {
          const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
          try { const event = JSON.parse(line); options.onEvent(event); } catch { /* final output parser reports malformed results */ }
        }
      }
    };
    child.stdout.on("data", chunk => collect(stdout, chunk, true));
    child.stderr.on("data", chunk => collect(stderr, chunk, false));
    child.once("error", error => finish({ exitCode: null, signal: null, spawnError: String(error) }));
    // A descendant may keep stdout open after the root exits. Reap/bound that wait too.
    child.once("exit", (exitCode, signal) => { lastExit = { exitCode, signal }; terminate(); });
    child.once("close", (exitCode, signal) => finish({ exitCode, signal, spawnError: null }));
    timer = setTimeout(() => { timedOut = true; terminate(); }, options.timeoutMs ?? 10000);
    child.stdin.on("error", () => {});
    if (options.mutating && process.platform === "win32" && child.pid) {
      job = windowsJob(child.pid);
      job.ready.then(ok => {
        if (finished || timedOut || cancelled) { job.close(); return; }
        if (!ok) { terminate(); finish({ exitCode: null, signal: null, spawnError: "Could not assign the Claude writer to a Windows Job Object." }); }
        else child.stdin.end(options.input ?? "");
      });
    } else child.stdin.end(options.input ?? "");
  });
}
