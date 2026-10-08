import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_SCHEMA,
  MAX_PROMPT_BYTES,
  MAX_REQUEST_BYTES,
  MAX_SCHEMA_BYTES,
  READ_ONLY_TOOLS,
  buildClaudeArgs,
  classifyFailure,
  executeRequest,
  extractJson,
  loadRequest,
  resolveClaudeLauncher,
  runPreflight,
  runProcess,
  sanitizeClaudeArgs,
  validateRequest,
} from "../plugins/ultraclaude/skills/claude-workflow/scripts/claude-node.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const fakeClaude = path.join(here, "fixtures", "fake-claude.mjs");
const relayScript = path.join(
  repoRoot,
  "plugins",
  "ultraclaude",
  "skills",
  "claude-workflow",
  "scripts",
  "claude-node.mjs"
);

const fakeLauncher = {
  command: process.execPath,
  argsPrefix: [fakeClaude],
  displayPath: fakeClaude,
  source: "fixture",
};

function requestFor(prompt, extra = {}) {
  return { prompt, cwd: repoRoot, timeoutSec: 10, ...extra };
}

function completedProcess(overrides = {}) {
  return {
    exitCode: 0,
    signal: null,
    spawnError: null,
    stdout: "",
    stderr: "",
    timedOut: false,
    outputLimitExceeded: false,
    durationMs: 1,
    ...overrides,
  };
}

async function runCli(args, input = "") {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [relayScript, ...args], {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    child.stdin.end(input);
  });
}

test("installs the documented Opus/max defaults", () => {
  const request = validateRequest({ prompt: "Review this.", cwd: repoRoot });
  assert.equal(request.cwd, repoRoot);
  assert.deepEqual(request.schema, DEFAULT_SCHEMA);
  assert.equal(request.model, DEFAULT_MODEL);
  assert.equal(request.model, "opus");
  assert.equal(request.effort, DEFAULT_EFFORT);
  assert.equal(request.effort, "max");
  assert.equal(request.persistSession, false);
});

test("Haiku 5.5 takes effort, Haiku 4.5 omits it, and explicit overrides are validated", () => {
  const request = validateRequest({
    prompt: "Cheap check.",
    cwd: repoRoot,
    model: "haiku",
  });
  assert.equal(request.model, "haiku");
  assert.equal(request.effort, "medium", "Haiku 5.5 runs at medium unless the request names an effort, even on the legacy max route");
  assert.ok(buildClaudeArgs(request).join(" ").includes("--effort medium"));
  assert.equal(validateRequest({ prompt: "Check", model: "haiku", effort: "low" }).effort, "low");
  const legacyHaiku = validateRequest({ prompt: "Check", cwd: repoRoot, model: "claude-haiku-4-5" });
  assert.equal(legacyHaiku.effort, null);
  assert.equal(buildClaudeArgs(legacyHaiku).includes("--effort"), false);
  assert.throws(() => validateRequest({ prompt: "Check", model: "claude-haiku-4-5-20251001", effort: "low" }), /not supported/);
  assert.equal(validateRequest({ prompt: "Check", model: "sonnet", effort: "low" }).effort, "low");
});

test("rejects unknown, executable, and malformed request fields", () => {
  assert.throws(
    () => validateRequest({ prompt: "Review.", cwd: repoRoot, allowWrites: true }),
    /Unknown request fields/
  );
  assert.throws(
    () => validateRequest({ prompt: "Review.", cwd: repoRoot, claudePath: fakeClaude }),
    /Unknown request fields/
  );
  assert.throws(
    () => validateRequest({ prompt: "Review.", cwd: repoRoot, effort: "ultra" }),
    /request\.effort/
  );
  assert.throws(
    () => validateRequest({ prompt: "Review.", cwd: repoRoot, model: "../model" }),
    /request\.model/
  );
  assert.throws(
    () => validateRequest({ prompt: "Review.", cwd: 42 }),
    /request\.cwd/
  );
  assert.throws(
    () => validateRequest({ prompt: "  ", cwd: repoRoot }),
    /request\.prompt/
  );
});

test("enforces request numeric and session bounds", () => {
  assert.throws(
    () => validateRequest(requestFor("Review.", { timeoutSec: 0 })),
    /timeoutSec/
  );
  assert.throws(
    () => validateRequest(requestFor("Review.", { timeoutSec: 1.5 })),
    /timeoutSec/
  );
  assert.throws(
    () => validateRequest(requestFor("Review.", { maxBudgetUsd: 0 })),
    /maxBudgetUsd/
  );
  assert.throws(
    () => validateRequest(requestFor("Review.", { persistSession: "yes" })),
    /persistSession/
  );
  assert.throws(
    () => validateRequest(requestFor("Review.", { resumeSessionId: "bad/id" })),
    /resumeSessionId/
  );
});

test("enforces prompt and schema byte limits", () => {
  assert.throws(
    () => validateRequest(requestFor("x".repeat(MAX_PROMPT_BYTES + 1))),
    /prompt exceeds/
  );
  assert.throws(
    () =>
      validateRequest(
        requestFor("Review.", {
          schema: { type: "object", description: "x".repeat(MAX_SCHEMA_BYTES) },
        })
      ),
    /schema exceeds/
  );
});

test("builds a hermetic read-only Claude invocation", () => {
  const request = validateRequest(requestFor("Review."));
  const args = buildClaudeArgs(request);

  for (const required of [
    "--safe-mode",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--no-chrome",
    "--no-session-persistence",
    "--permission-mode",
    "dontAsk",
  ]) {
    assert.ok(args.includes(required), `missing ${required}`);
  }
  assert.equal(args[args.indexOf("--tools") + 1], READ_ONLY_TOOLS);
  assert.equal(args[args.indexOf("--allowed-tools") + 1], READ_ONLY_TOOLS);
  assert.equal(args[args.indexOf("--model") + 1], "opus");
  assert.equal(args[args.indexOf("--effort") + 1], "max");
  assert.ok(!args.includes("Write"));
  assert.ok(!args.includes("Edit"));
  assert.ok(!args.includes("Bash"));
});

test("keeps persistent sessions and resumes by id", () => {
  const request = validateRequest(
    requestFor("Continue.", { resumeSessionId: "abc-123" })
  );
  const args = buildClaudeArgs(request);
  assert.ok(!args.includes("--no-session-persistence"));
  assert.equal(args[args.indexOf("--resume") + 1], "abc-123");
});

test("sanitizes schema and guardrail arguments in dry-run output", () => {
  const args = buildClaudeArgs(validateRequest(requestFor("Review.")));
  const sanitized = sanitizeClaudeArgs(args);
  assert.match(sanitized[sanitized.indexOf("--json-schema") + 1], /^<json-schema:/);
  assert.equal(
    sanitized[sanitized.indexOf("--append-system-prompt") + 1],
    "<ultraclaude-review-guardrail>"
  );
});

test("extracts whole or final-line JSON and rejects empty output", () => {
  assert.deepEqual(extractJson('{"ok":true}'), { ok: true });
  assert.deepEqual(extractJson('warning\n{"ok":true}\n'), { ok: true });
  assert.throws(() => extractJson("  "), /empty stdout/);
  assert.throws(() => extractJson("warning only"), SyntaxError);
});

test("classifies common failures with conservative retry policy", () => {
  assert.deepEqual(classifyFailure("429 rate limit"), {
    kind: "rate_limit",
    retryable: true,
  });
  assert.deepEqual(classifyFailure("Authentication required"), {
    kind: "auth",
    retryable: false,
  });
  assert.deepEqual(classifyFailure("weekly usage limit"), {
    kind: "usage_limit",
    retryable: false,
  });
  assert.deepEqual(classifyFailure("Network error: ECONNRESET"), {
    kind: "network",
    retryable: true,
  });
  assert.deepEqual(classifyFailure("model is not supported"), {
    kind: "model",
    retryable: false,
  });
  assert.deepEqual(classifyFailure("", { timedOut: true }), {
    kind: "timeout",
    retryable: true,
  });
});

test("runs a full structured request through a fake Claude executable", async () => {
  const result = await executeRequest(requestFor("Review the fixture."), {
    claudePath: fakeClaude,
  });

  assert.equal(result.ok, true);
  assert.equal(result.output.verdict, "mixed");
  assert.match(result.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(result.stats.turns, 1);
});

test("fails closed on authentication and parse errors", async () => {
  const authFailure = await executeRequest(requestFor("__FAIL_AUTH__"), {
    claudePath: fakeClaude,
  });
  assert.equal(authFailure.ok, false);
  assert.equal(authFailure.error.kind, "auth");

  const parseFailure = await executeRequest(requestFor("__MALFORMED__"), {
    claudePath: fakeClaude,
  });
  assert.equal(parseFailure.ok, false);
  assert.equal(parseFailure.error.kind, "parse");
});

test("fails closed when structured output is absent or not an object", async () => {
  const absent = await executeRequest(requestFor("__NO_STRUCTURED__"), {
    claudePath: fakeClaude,
  });
  assert.equal(absent.ok, false);
  assert.equal(absent.error.kind, "schema");

  const nonObject = await executeRequest(requestFor("__NON_OBJECT__"), {
    claudePath: fakeClaude,
  });
  assert.equal(nonObject.ok, false);
  assert.equal(nonObject.error.kind, "schema");
});

test("preserves failure classification from the Claude process", async () => {
  for (const [prompt, kind, retryable] of [
    ["__FAIL_USAGE__", "usage_limit", false],
    ["__FAIL_NETWORK__", "network", true],
    ["__FAIL_MODEL__", "model", false],
  ]) {
    const result = await executeRequest(requestFor(prompt), { claudePath: fakeClaude });
    assert.equal(result.ok, false);
    assert.equal(result.error.kind, kind);
    assert.equal(result.error.retryable, retryable);
  }
});

test("rejects a missing cwd or Claude executable before model execution", async () => {
  const badCwd = await executeRequest({
    prompt: "Review.",
    cwd: path.join(repoRoot, "definitely-missing"),
  });
  assert.equal(badCwd.ok, false);
  assert.equal(badCwd.error.kind, "invalid_request");

  const badCli = await executeRequest(requestFor("Review."), {
    claudePath: path.join(repoRoot, "missing-claude"),
  });
  assert.equal(badCli.ok, false);
  assert.equal(badCli.error.kind, "cli_not_found");
});

test("runProcess enforces timeout and output limits", async () => {
  const args = buildClaudeArgs(validateRequest(requestFor("ignored")));
  const timed = await runProcess(fakeLauncher, args, {
    cwd: repoRoot,
    input: "__SLOW__",
    timeoutMs: 30,
    terminationGraceMs: 100,
  });
  assert.equal(timed.timedOut, true);
  assert.ok(timed.durationMs < 2_000);

  const large = await runProcess(fakeLauncher, args, {
    cwd: repoRoot,
    input: "__LARGE__",
    timeoutMs: 2_000,
    maxOutputBytes: 128,
    terminationGraceMs: 100,
  });
  assert.equal(large.outputLimitExceeded, true);
});

test("resolves explicit JavaScript launchers without a shell", async () => {
  const launcher = await resolveClaudeLauncher({ explicitPath: fakeClaude });
  assert.equal(launcher.command, process.execPath);
  assert.deepEqual(launcher.argsPrefix, [fakeClaude]);
  await assert.rejects(
    resolveClaudeLauncher({ explicitPath: path.join(repoRoot, "missing") }),
    /does not exist/
  );
});

test("preflight checks all relay capabilities and auth without a model call", async () => {
  const result = await runPreflight({ claudePath: fakeClaude });
  assert.equal(result.ok, true);
  assert.equal(result.authenticated, true);
  assert.equal(result.modelCallMade, false);
  assert.equal(result.capabilities.safeMode, true);
  assert.equal(result.capabilities.strictMcpConfig, true);
  assert.equal(result.capabilities.effort, true);
  assert.match(result.version, /Fake Claude Code/);
});

test("preflight reports missing capabilities and failed commands accurately", async () => {
  const flags = [
    "--print",
    "--safe-mode",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--no-chrome",
    "--permission-mode",
    "--tools",
    "--allowedTools",
    "--json-schema",
    "--output-format",
    "--append-system-prompt",
    "--no-session-persistence",
    "--model",
    "--max-budget-usd",
    "--resume",
  ].join("\n");
  const missingCapability = await runPreflight(
    {},
    {
      launcher: fakeLauncher,
      runProcess: async (_launcher, args) => {
        if (args[0] === "--version") return completedProcess({ stdout: "fake\n" });
        if (args[0] === "--help") return completedProcess({ stdout: flags });
        return completedProcess({ stdout: '{"loggedIn":true}' });
      },
    }
  );
  assert.equal(missingCapability.ok, false);
  assert.equal(missingCapability.error.kind, "preflight");
  assert.match(missingCapability.error.message, /effort/);

  const commandFailure = await runPreflight(
    {},
    {
      launcher: fakeLauncher,
      runProcess: async () => completedProcess({ exitCode: 1, stderr: "boom" }),
    }
  );
  assert.equal(commandFailure.ok, false);
  assert.equal(commandFailure.error.kind, "preflight");
  assert.match(commandFailure.error.message, /boom/);
});

test("loadRequest accepts bounded files and rejects directories and oversized files", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "ultraclaude-test-"));
  try {
    const validPath = path.join(temp, "request.json");
    await writeFile(validPath, '{"prompt":"Review."}', "utf8");
    assert.deepEqual(await loadRequest(validPath), { prompt: "Review." });
    await assert.rejects(loadRequest(temp), /not a file/);

    const largePath = path.join(temp, "large.json");
    await writeFile(largePath, Buffer.alloc(MAX_REQUEST_BYTES + 1, 0x20));
    await assert.rejects(loadRequest(largePath), /request file exceeds/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI exposes schema and performs a full fake run", async () => {
  const schema = await runCli(["schema"]);
  assert.equal(schema.exitCode, 0);
  assert.deepEqual(JSON.parse(schema.stdout), DEFAULT_SCHEMA);

  const run = await runCli([
    "run",
    "--request",
    path.join("tests", "fixtures", "request.json"),
    "--claude-path",
    fakeClaude,
  ]);
  assert.equal(run.exitCode, 0, run.stderr || run.stdout);
  assert.equal(JSON.parse(run.stdout).ok, true);

  const invalid = await runCli(["preflight", "--request", "ignored.json"]);
  assert.equal(invalid.exitCode, 2);
  assert.equal(JSON.parse(invalid.stdout).error.kind, "invalid_arguments");
});
