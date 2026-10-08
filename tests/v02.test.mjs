import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildClaudeArgs, validateRequest, executeRequest, summarizeClaudeResult, executeJobRequest, validateJobRequest } from "../plugins/ultraclaude/skills/claude-workflow/scripts/claude-node.mjs";
import { git, prepareWorkspace, validateAllowedPaths, acquireWorkspaceLease, permissionPath } from "../plugins/ultraclaude/skills/claude-workflow/scripts/workspace.mjs";
import { startJob, waitJob, cancelJob, jobStatus } from "../plugins/ultraclaude/skills/claude-workflow/scripts/jobs.mjs";
import { planWorkflow, executeWorkflow } from "../plugins/ultraclaude/skills/claude-workflow/scripts/workflows.mjs";
import { runOwnedProcess } from "../plugins/ultraclaude/skills/claude-workflow/scripts/owned-process.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fake = path.join(here, "fixtures", "fake-claude.mjs");
async function fixture(t, repository = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ultraclaude-v02-"));
  const cwd = path.join(root, "repo"); await mkdir(cwd);
  const env = { ...process.env, ULTRACLAUDE_STATE_DIR: path.join(root, "state"), ULTRACLAUDE_CLAUDE_PATH: fake,
    ULTRACLAUDE_WORKTREE_ROOT: root, ULTRACLAUDE_MAX_CONCURRENT: "2", GIT_CONFIG_GLOBAL: path.join(root, "empty-git-config"), GIT_CONFIG_NOSYSTEM: "1" };
  await writeFile(env.GIT_CONFIG_GLOBAL, "");
  if (repository) {
    await git(cwd, ["init"]); await git(cwd, ["config", "user.name", "Fixture"]); await git(cwd, ["config", "user.email", "fixture@example.invalid"]);
    await writeFile(path.join(cwd, "input.txt"), "original\n");
    await git(cwd, ["add", "input.txt"]); await git(cwd, ["commit", "-m", "fixture"]);
  }
  t.after(async () => { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  return { root, cwd, env };
}
function rawResult(output) { return { type: "result", subtype: "success", is_error: false, structured_output: output }; }
const processResult = { exitCode: 0, durationMs: 1 };

test("enforces schema required fields, enums, nested types, ranges and extra properties", () => {
  for (const output of [{ confidence: 999 }, { verdict: "made_up", summary: "s", findings: [], confidence: 5 },
    { verdict: "mixed", summary: "s", findings: [{ severity: "high" }], confidence: 5 },
    { verdict: "mixed", summary: "s", findings: [], confidence: 50, extra: true }]) {
    const result = summarizeClaudeResult(rawResult(output), processResult); assert.equal(result.ok, false); assert.equal(result.error.kind, "schema");
  }
});
test("supports custom schema references and rejects unresolved references before invocation", () => {
  const schema = { type: "object", required: ["answer"], additionalProperties: false, properties: { answer: { $ref: "#/$defs/answer" } }, $defs: { answer: { type: "integer", minimum: 2 } } };
  validateRequest({ prompt: "p", schema });
  assert.equal(summarizeClaudeResult(rawResult({ answer: 1 }), processResult, schema).ok, false);
  assert.equal(summarizeClaudeResult(rawResult({ answer: 2 }), processResult, schema).ok, true);
  assert.throws(() => validateRequest({ prompt: "p", schema: { type: "object", $ref: "https://unconfigured.invalid/schema" } }));
});
test("routes typed requests while preserving legacy quality defaults", () => {
  assert.equal(validateRequest({ prompt: "p" }).model, "opus");
  const daily = validateRequest({ prompt: "p", kind: "ask" }); assert.equal(daily.model, "claude-sonnet-5-5"); assert.equal(daily.effort, "xhigh");
  const light = validateRequest({ prompt: "p", kind: "verify", tier: "light" });
  assert.equal(light.model, "claude-haiku-5-5"); assert.equal(light.effort, "medium");
  assert.equal(validateRequest({ prompt: "p", kind: "verify", tier: "light", effort: "max" }).effort, "max");
  assert.equal(validateRequest({ prompt: "p", kind: "review", tier: "final" }).model, "claude-opus-5-5");
  assert.equal(validateRequest({ prompt: "p", kind: "ask", tier: "deep" }).model, "claude-fable-5-1");
  assert.equal(validateRequest({ prompt: "p", kind: "ask", model: "opus", effort: "high" }).effort, "high");
  assert.throws(() => validateRequest({ prompt: "p", model: "claude-nonexistent-model" }), /unknown/);
  assert.throws(() => validateRequest({ prompt: "p", model: "claude-opus-4-6", effort: "xhigh" }), /not supported/);
  assert.throws(() => validateRequest({ prompt: "p", model: "haiku[1m]" }), /context suffix/);
  assert.equal(validateRequest({ prompt: "p", kind: "ask", model: "claude-opus-4-6" }).effort, "high");
});
test("validates effort against provider alias targets instead of first-party defaults", () => {
  const daily = { prompt: "p", kind: "ask" };
  for (const provider of ["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"]) {
    const env = { [provider]: "1" };
    const request = validateRequest(daily, { env }); assert.equal(request.model, "sonnet"); assert.equal(request.effort, null);
    assert.throws(() => validateRequest({ ...daily, effort: "xhigh" }, { env }), /not supported/);
    const pinned = { ...env, ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-5-5" };
    assert.equal(validateRequest(daily, { env: pinned }).effort, "xhigh");
  }
  assert.equal(validateRequest({ ...daily, tier: "final" }, { env: { CLAUDE_CODE_USE_FOUNDRY: "1" } }).effort, "max");
  for (const provider of ["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"]) {
    const light = validateRequest({ prompt: "p", kind: "verify", tier: "light" }, { env: { [provider]: "1" } });
    assert.equal(light.model, "haiku"); assert.equal(light.effort, null, "provider haiku aliases keep Haiku 4.5 semantics");
  }
});
test("supports operator deployment catalogs without trusting executable/model definitions in requests", async t => {
  const { root } = await fixture(t); const catalog = path.join(root, "models.json");
  await writeFile(catalog, JSON.stringify([{ id: "arn:aws:bedrock:region:account:inference-profile/custom", efforts: ["high"] }]));
  const env = { ULTRACLAUDE_MODEL_CATALOG: catalog };
  assert.equal(validateRequest({ prompt: "p", model: "arn:aws:bedrock:region:account:inference-profile/custom", effort: "high" }, { env }).effort, "high");
  assert.throws(() => validateRequest({ prompt: "p", modelCatalog: catalog }), /Unknown/);
});
test("write profiles use scoped Edit rules for both Edit and Write, without permission bypass", () => {
  const request = validateRequest({ prompt: "p", mode: "edit", isolation: "direct", allowedPaths: ["src", "package.json"] });
  const args = buildClaudeArgs(request); const allowed = args[args.indexOf("--allowed-tools") + 1];
  assert.match(allowed, /Edit\(/); assert.equal(allowed.split(",").includes("Edit"), false); assert.equal(allowed.split(",").includes("Write"), false);
  assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk"); assert.equal(args.includes("--dangerously-skip-permissions"), false);
  assert.equal(args[args.indexOf("--tools") + 1].includes("Bash"), false);
  const settings = JSON.parse(args[args.indexOf("--settings") + 1]); assert.ok(settings.permissions.deny.some(rule => rule.includes(".git")));
  assert.equal(permissionPath("C:\\Users\\alice\\repo"), "//c/Users/alice/repo");
  assert.throws(() => validateRequest({ prompt: "p", mode: "edit", allowedPaths: ["../elsewhere"] }), /allowedPaths/);
});
test("shell execution fails closed on native Windows and requires explicit simple commands", () => {
  assert.throws(() => validateRequest({ prompt: "p", mode: "implement", execution: "sandboxed" }, { platform: "win32" }), /native Windows/);
  const request = validateRequest({ prompt: "p", mode: "implement", execution: "sandboxed", shellCommands: ["npm test"] }, { platform: "linux" });
  const args = buildClaudeArgs(request); const settings = JSON.parse(args[args.indexOf("--settings") + 1]);
  assert.equal(settings.sandbox.failIfUnavailable, true); assert.equal(settings.sandbox.allowUnsandboxedCommands, false);
  assert.equal(settings.sandbox.autoAllowBashIfSandboxed, false);
  assert.equal(settings.sandbox.filesystem.disabled, false);
  assert.throws(() => validateRequest({ prompt: "p", mode: "implement", execution: "sandboxed", allowedPaths: ["src"], shellCommands: ["npm test"] }, { platform: "linux" }), /whole workspace/);
  assert.throws(() => validateRequest({ prompt: "p", mode: "implement", execution: "sandboxed", shellCommands: ["npm test; touch /tmp/x"] }, { platform: "linux" }), /shellCommands/);
});
test("preserves actual model usage and permission denials separately from requested routing", async t => {
  const { cwd, env } = await fixture(t);
  const result = await executeRequest({ prompt: "p", cwd, kind: "ask", model: "sonnet" }, { env });
  assert.equal(result.ok, true); assert.equal(result.routing.requestedModel, "sonnet"); assert.deepEqual(result.routing.observedModels, ["claude-opus-5-5"]);
  assert.equal(result.stats.usage.input_tokens, 10); assert.equal(result.modelUsage["claude-opus-5-5"].outputTokens, 20); assert.equal(result.routing.effectiveEffort, null);
});
test("supports task files and free-text answers", async t => {
  const { root, cwd, env } = await fixture(t); const task = path.join(root, "brief.txt"); await writeFile(task, "p");
  const result = await executeRequest({ taskFile: task, cwd, schemaPreset: "none" }, { env });
  assert.equal(result.ok, true); assert.equal(result.text, "Fixture text answer");
  assert.throws(() => validateRequest({ prompt: "p", taskFile: task }), /not both/);
});
test("creates a real isolated worktree, writes there, and keeps the source unchanged", async t => {
  const { cwd, env } = await fixture(t, true);
  const result = await executeRequest({ prompt: "__WRITE_FIXTURE__", cwd, mode: "implement", persistSession: true }, { env });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.workspace.isolation, "worktree");
  assert.match(await readFile(path.join(result.workspace.path, "fixture-output.txt"), "utf8"), /written/);
  await assert.rejects(readFile(path.join(cwd, "fixture-output.txt")), { code: "ENOENT" });
  assert.equal(result.output.tests[0].status, "not_run");
  const followup = await executeRequest({ prompt: "p", cwd: result.workspace.cwd, mode: "implement", persistSession: true, resumeSessionId: result.sessionId }, { env });
  assert.equal(followup.ok, true, JSON.stringify(followup)); assert.equal(followup.workspace.path, result.workspace.path);
  await git(cwd, ["worktree", "remove", "--force", result.workspace.path]);
});
test("rejects dirty source repositories instead of silently omitting changes", async t => {
  const { cwd, env } = await fixture(t, true); await writeFile(path.join(cwd, "input.txt"), "dirty");
  await assert.rejects(prepareWorkspace(validateRequest({ prompt: "p", cwd, mode: "implement" }), env), /uncommitted/);
});
test("leases a new worktree before exposing a persistent session", async t => {
  const { cwd, env } = await fixture(t, true);
  let target;
  const result = await executeRequest({ prompt: "p", cwd, mode: "implement", persistSession: true }, {
    env, launcher: { command: process.execPath },
    runProcess: async (_launcher, args, options) => {
      target = options.cwd;
      await assert.rejects(acquireWorkspaceLease(validateRequest({ prompt: "p", cwd: target, mode: "implement" }), env), /Another/);
      return { exitCode: 0, stdout: JSON.stringify({ ...rawResult({ status: "done", summary: "s", files: [], tasks: [], tests: [], openQuestions: [], risks: [] }), session_id: args[args.indexOf("--session-id") + 1] }) };
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  await (await acquireWorkspaceLease(validateRequest({ prompt: "p", cwd: target, mode: "implement" }), env))();
  await git(cwd, ["worktree", "remove", "--force", result.workspace.path]);
});
test("keeps failed implementation work resumable without suggesting a replay", async t => {
  const { cwd, env } = await fixture(t, true);
  const failed = await executeRequest({ prompt: "__FAIL_NETWORK__", cwd, mode: "implement", persistSession: true }, { env });
  assert.equal(failed.ok, false); assert.equal(failed.error.kind, "network"); assert.equal(failed.error.retryable, false);
  assert.ok(failed.sessionId); assert.equal(failed.workspace.isolation, "worktree");
  const followup = await executeRequest({ prompt: "p", cwd: failed.workspace.cwd, mode: "implement", resumeSessionId: failed.sessionId }, { env });
  assert.equal(followup.ok, true, JSON.stringify(followup));
  await git(cwd, ["worktree", "remove", "--force", failed.workspace.path]);
});
test("binds resumed sessions to the original project and permission scope", async t => {
  const { root, cwd, env } = await fixture(t); const other = path.join(root, "other"); await mkdir(other);
  const first = await executeRequest({ prompt: "p", cwd, persistSession: true }, { env }); assert.equal(first.ok, true);
  for (const changes of [{ cwd: other }, { mode: "edit", isolation: "direct" }]) {
    const result = await executeRequest({ prompt: "p", cwd, resumeSessionId: first.sessionId, ...changes }, { env });
    assert.equal(result.ok, false); assert.equal(result.error.kind, "permission");
  }
  const unknown = await executeRequest({ prompt: "p", cwd, resumeSessionId: "unknown-session" }, { env }); assert.equal(unknown.ok, false);
});
test("serializes workspace writers and releases the lease", async t => {
  const { cwd, env } = await fixture(t); const request = validateRequest({ prompt: "p", cwd, mode: "edit", isolation: "direct" });
  const release = await acquireWorkspaceLease(request, env);
  await assert.rejects(acquireWorkspaceLease(request, env), /Another/); await release();
  await (await acquireWorkspaceLease(request, env))();
});
test("rejects a resumed session after its directory was replaced", async t => {
  const { root, cwd, env } = await fixture(t);
  const first = await executeRequest({ prompt: "p", cwd, persistSession: true }, { env });
  assert.equal(first.ok, true);
  await rename(cwd, path.join(root, "old-repo")); await mkdir(cwd);
  const result = await executeRequest({ prompt: "p", cwd, resumeSessionId: first.sessionId }, { env });
  assert.equal(result.ok, false); assert.match(result.error.message, /replaced/);
});
test("rejects allowed paths resolving outside the workspace", async t => {
  const { root, cwd } = await fixture(t); const outside = path.join(root, "outside"); await mkdir(outside);
  await symlink(outside, path.join(cwd, "escape"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(validateAllowedPaths(validateRequest({ prompt: "p", cwd, mode: "edit", isolation: "direct", allowedPaths: ["escape"] })), /outside/);
});
test("runs and polls asynchronous jobs with streamed progress", async t => {
  const { cwd, env } = await fixture(t);
  const started = await startJob({ prompt: "p", cwd, kind: "ask" }, validateJobRequest, { env });
  const result = await waitJob(started.runId, 15, env); assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.pending, undefined);
  const status = await jobStatus(started.runId, env); assert.equal(status.run.state, "done"); assert.equal(status.run.lastEvent.type, "result");
  assert.equal((await cancelJob(started.runId, env)).cancelled, false);
});
test("cancels only its own asynchronous run and preserves the failure", async t => {
  const { cwd, env } = await fixture(t);
  const started = await startJob({ prompt: "__SLOW__", cwd }, validateJobRequest, { env });
  await cancelJob(started.runId, env); const result = await waitJob(started.runId, 15, env);
  assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.kind, "cancelled");
});
test("cancels an owned writer and its live descendant", async t => {
  const { cwd, env } = await fixture(t);
  const controller = new AbortController(); let descendant;
  const result = await runOwnedProcess({ command: process.execPath }, [path.join(here, "fixtures", "process-tree.mjs")], {
    cwd, env, mutating: true, timeoutMs: 8000, terminationGraceMs: 500, signal: controller.signal,
    onEvent: event => { descendant = event.pid; controller.abort(); },
  });
  assert.ok(descendant, JSON.stringify(result)); assert.equal(result.cancelled, true);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.throws(() => process.kill(descendant, 0), { code: "ESRCH" });
});
test("bounds inherited pipe waits after the root process exits", async t => {
  const { cwd, env } = await fixture(t); let descendant;
  const started = Date.now();
  const result = await runOwnedProcess({ command: process.execPath }, [path.join(here, "fixtures", "process-tree.mjs"), "--exit-root"], {
    cwd, env, mutating: true, timeoutMs: 8000, terminationGraceMs: 500, onEvent: event => { descendant = event.pid; },
  });
  assert.equal(result.exitCode, 0, JSON.stringify(result)); assert.equal(result.timedOut, false); assert.ok(Date.now() - started < 7000);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.throws(() => process.kill(descendant, 0), { code: "ESRCH" });
});
test("routes security review to final unless the owner supplied a tier", () => {
  const plan = planWorkflow({ workflow: "claude-review", prompt: "review input.txt" }, validateRequest);
  assert.equal(plan.nodes.find(node => node.label === "security").request.tier, "final");
  const light = planWorkflow({ workflow: "claude-review", prompt: "review input.txt", tier: "light" }, validateRequest);
  assert.ok(light.nodes.every(node => node.request.tier === "light"));
});
test("checks all stable item IDs and ranks only candidates with both judgments", async t => {
  const { cwd, env } = await fixture(t);
  const result = await executeJobRequest({ workflow: "judge-panel", cwd, candidates: [{ id: "a", text: "one" }, { id: "b", text: "two" }], rubric: "correctness", codexScores: [{ id: "a", score: 60 }] }, { env });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.deepEqual(result.ranked.map(item => item.id), ["a"]); assert.deepEqual(result.unverifiedCandidates, ["b"]);
  const invalid = await executeWorkflow({ workflow: "crosscheck", cwd, claims: [{ id: "a", text: "claim" }] }, validateRequest,
    async () => ({ ok: true, output: { results: [] } }));
  assert.equal(invalid.ok, false); assert.equal(invalid.stages[0].error.kind, "schema");
});
test("rejects malformed schema output from the full relay path", async t => {
  const { cwd, env } = await fixture(t); const result = await executeRequest({ prompt: "__BAD_SCHEMA__", cwd }, { env });
  assert.equal(result.ok, false); assert.equal(result.error.kind, "schema");
});
