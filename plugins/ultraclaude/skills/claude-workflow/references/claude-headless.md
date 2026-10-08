# Claude relay contract

## Requests

Use a JSON file or --request -. Task text is sent through stdin without a shell.

| Field | Meaning |
|---|---|
| prompt / taskFile | Exactly one task source; maximum 2 MiB |
| cwd | Existing project directory; defaults to process cwd |
| mode | review (default), edit, implement; writes require explicit mutation mode |
| kind | ask, verify, review, implement; controls routing/deadline/schema defaults |
| tier | light, daily, final, deep; explicit model/effort takes precedence |
| model / effort | Known model/deployment and a supported effort; Haiku omits effort |
| schema / schemaPreset | One custom object schema or review, ask, verify, implement, judge, none |
| isolation | worktree by default for writers; direct must be selected deliberately |
| allowedPaths | Relative file/directory paths for writers; default ["."]; no traversal/globs |
| baseRef | Git commit/branch to start the worktree from; default HEAD |
| execution | codex (default) or sandboxed; sandboxed requires Linux/WSL2/macOS |
| shellCommands | Exact simple commands, only for sandboxed implement; no wildcard/operators |
| networkDomains | Exact sandbox hostnames, only with sandboxed execution |
| timeoutSec | 1..14400; legacy default 300, typed default depends on kind |
| maxTurns | 1..1000; typed default depends on kind |
| maxBudgetUsd | >0..100 CLI API-cost estimate cap |
| persistSession | false by default; enable for real follow-ups |
| resumeSessionId | Registered session only; original cwd and permission scope must match |

Unknown fields are rejected. JSON schemas are compiled and results independently validated.
Schemas support draft-7 and explicit draft-2020-12, without fetching external references; format
annotations are not enforced. Schema size is at most 24 KiB; combined process output at most 4 MiB.
Mutation modes require an object schema. Free text is available through schemaPreset:none for review.

## Commands

- preflight: CLI, authentication, flags, policy and version capabilities; no inference.
- dry-run --request FILE: inspect invocation/routing; creates no worktree and makes no model call.
- run --request FILE: synchronous request.
- start --request FILE: detached job; returns runId. Also accepts workflow requests.
- status [RUN_ID], wait RUN_ID --max-wait 10, result RUN_ID, cancel RUN_ID.
- wait returns exit code 3 while pending; waits at most 30 seconds per invocation.
- policy, models, schema --preset NAME, example-request.

Only cancel runs owned by this invocation/task. Never kill other Claude sessions. Jobs use a
machine-local concurrency pool (ULTRACLAUDE_MAX_CONCURRENT, default 2, range 1..8).
Workspace leases prevent simultaneous writers or resumed sessions in the same workspace.
ULTRACLAUDE_STATE_DIR selects the operator-owned registry (default ~/.ultraclaude);
ULTRACLAUDE_WORKTREE_ROOT selects an existing directory outside the source repo (default its parent).

## Write boundary and shell execution

All profiles keep safe mode, strict MCP isolation, no Chrome, disabled slash commands, and dontAsk.
Read-only requests expose Read/Glob/Grep. Writers add Edit/Write with scoped Edit(path) rules;
Write(path) is not a Claude permission rule. User/project settings sources are disabled for writers;
managed policy still applies. Git and agent-configuration paths are denied writes. Claude Code
checks requested and resolved symlink/junction paths. These are CLI permission controls, not a
whole-process filesystem sandbox.

Native Windows exposes no Claude Bash tool. Codex executes reported acceptance commands through
its own tools after checking the diff. To let Claude execute an allowlisted command autonomously,
run Node and Claude inside Linux/WSL2/macOS and set execution:sandboxed with shellCommands.
The relay requires sandbox.enabled, failIfUnavailable, and allowUnsandboxedCommands:false.
autoAllowBashIfSandboxed:false keeps command approval subject to the exact command rules.
The Bash sandbox allows writes throughout cwd, so this profile requires allowedPaths:["."];
choose execution:codex for narrower file scopes. Git/agent paths remain denied.
A missing sandbox fails instead of falling back. Keep the repository/worktree on a filesystem Git
can use inside that environment. A container can provide an additional whole-process boundary.

Prompts cannot select a CLI binary. Use --claude-path or ULTRACLAUDE_CLAUDE_PATH as operator settings.
Windows npm launchers resolve to the underlying exe/JS instead of interpolated .cmd prompts.
Native Windows writers are assigned to a Job Object before task delivery; closing its controller
stops descendants. POSIX uses an owned process group. Cancellation never targets unrelated PIDs.

## Results and sessions

Success returns ok:true and output (validated object) or text, workspace, sessionId, routing,
modelUsage, permissionDenials, and stats. requestedModel/effort and observedModels are separate.
Missing observed effort stays null. Model output remains a claim until Codex verifies it.

Failure returns ok:false and error.kind/message/retryable. Writes may have happened even when
output is malformed. Workspace and pre-registered session IDs are retained where available.
Resume repeats the original scope. Do not replay mutating or resumed runs automatically.

Non-retryable: invalid_request, cli_not_found, auth, usage_limit, model, budget, permission,
schema, parse, output_limit, cancelled, execution, interrupted. Network/rate/server/timeout can
be retryable only for fresh read-only requests; inspect/back off before one deliberate retry.
No built-in workflow automatically repeats a failed call.

The state directory stores task requests, results, minimal progress events, and session scope.
Keep it private. Worktrees and partial changes remain available for inspection; no automatic merge,
commit, push, or destructive cleanup is performed.
