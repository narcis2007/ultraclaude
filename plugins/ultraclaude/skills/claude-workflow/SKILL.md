---
name: claude-workflow
description: Run bounded Claude Code consultations and multi-stage review, claim-verification, or candidate-judging workflows from Codex. Use when the user asks to involve Claude in a workflow or continue a Claude session. For a single question use claude-ask; for delegated edits use claude-implement.
---

# Claude workflows from Codex

Codex scopes the work, checks Claude's evidence, and owns the final result. Resolve the runner as
`<SKILL_DIR>/scripts/claude-node.mjs`, where SKILL_DIR is this file's directory.

Run `node "<runner>" preflight --pretty` before the first live call. This checks the CLI and auth,
not account access to every model. Stop on ok:false. Tell the user when making a live Claude call.

For a single review, write a JSON request with prompt, absolute cwd, kind:review, and
schemaPreset:review. Use `claude-review` when review lenses or finding triage add value.
Legacy requests without mode/kind/tier retain read-only Opus/max behavior.

For several stages, read [workflow patterns](references/workflow-patterns.md). Executable workflow
names are claude-review, crosscheck, cross-review, and judge-panel. Write the workflow request to
a file and use `start --request "<file>"`; poll `wait <runId> --max-wait 10`, inspect `status`, and
read `result`. Keep failures unverified. Never interpret a missing stage as agreement.

Model policy: light = Haiku 5.5/medium; daily = Sonnet 5.5/xhigh; final = Opus 5.5/max;
deep = explicitly selected Fable 5.1/xhigh. Read [model policy](references/model-policy.md) for
provider aliases, explicit overrides, and availability. A model selection never grants writes.

Use persistent sessions only for an actual follow-up. Set persistSession:true initially, retain
sessionId and workspace.cwd from the result, and resume with the same mode, execution, and write
scope. Unregistered sessions and permission changes are refused. Do not ask Claude to call Codex.

Read [the relay contract](references/claude-headless.md) for errors, job controls, task files,
schemas, cancellation, and partial results. Stop repeated exchanges when new evidence runs out;
use a task-specific call/budget limit instead of open-ended model back-and-forth.
