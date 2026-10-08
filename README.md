# Ultraclaude

Claude Code inside Codex: ask, review, implement, and run bounded workflows while Codex owns
verification and the final result. Version 0.2 adds opt-in writing without changing legacy
read-only requests. Independent project; not affiliated with Anthropic or OpenAI.

## Requirements and installation

- Node.js 18+, Codex with plugin support, and authenticated Claude Code.
- Claude Code 2.1.284+ for the current typed Sonnet default and 2.1.293+ for the Haiku 5.5 light tier; other models have version checks.
- Git for automatic worktrees. Native Windows supports file edits; Codex runs acceptance commands.

```sh
codex plugin marketplace add narcis2007/ultraclaude
codex plugin add ultraclaude@ultraclaude
```

From a local clone, use `codex plugin marketplace add .` and install the same plugin identity.
Restart the desktop app and start a new Codex thread after installation. Skills-only installation requires no npm install;
the JSON Schema validator is bundled. The equivalent npm CLI is available as `npx ultraclaude`.

Example requests to Codex:

- Ask Claude for an independent opinion on this conclusion.
- Have Claude review this change, including security and tests.
- Delegate this implementation to Claude in a separate worktree, then verify it.
- Have Claude verify these findings and reconcile the evidence with your review.

## Model routing

| Request | Model | Effort |
|---|---|---|
| Legacy: no mode/kind/tier | opus alias | max |
| light | Haiku 5.5 | medium |
| daily | Sonnet 5.5 | xhigh |
| final | Opus 5.5 | max |
| deep, explicit | Fable 5.1 | xhigh |

Explicit model/effort wins. Unsupported combinations are rejected. Security review lenses default
to final; explicit tiers override all lenses. Preflight checks the CLI/version, not account access
to each model. Results retain requested routing, observed modelUsage, tokens, costs, and permission
denials; absent observed effort stays null. Provider aliases/custom catalogs are documented in
[model policy](plugins/ultraclaude/skills/claude-workflow/references/model-policy.md).
Every live call uses the user's Claude account allowance or provider budget.

## Direct CLI

```sh
npx ultraclaude preflight --pretty
npx ultraclaude dry-run --request request.json --pretty
npx ultraclaude run --request request.json --pretty
npx ultraclaude start --request request.json --pretty
npx ultraclaude wait <runId> --max-wait 10 --pretty
npx ultraclaude status <runId> --pretty
npx ultraclaude result <runId> --pretty
npx ultraclaude cancel <runId> --pretty
```

A typed consultation:

```json
{"prompt":"Independently assess this design using the named files.","cwd":"/absolute/repo","kind":"ask","schemaPreset":"ask"}
```

A legacy read-only review remains:

```json
{"prompt":"Review this conclusion.","cwd":"/absolute/repo","persistSession":false}
```

A Haiku 5.5 check (medium effort unless the request names one; low through max are accepted):

```json
{"prompt":"Check this narrow conclusion.","cwd":"/absolute/repo","model":"haiku","effort":"high"}
```

## Delegated implementation

```json
{
  "taskFile":"/absolute/brief.txt",
  "cwd":"/absolute/source-repo",
  "mode":"implement",
  "allowedPaths":["src","tests"],
  "persistSession":true
}
```

The runner creates a sibling worktree/branch and reports its path, branch, and base commit. Dirty
source repositories are refused so local changes are not silently omitted. Use isolation:direct
only when editing the current tree is intended and authorized. Claude cannot commit, push, merge,
or edit Git/agent configuration through the exposed native tools. No automatic cleanup removes
partial work. Codex inspects actual changes and executes the acceptance checks.

For a follow-up, use resumeSessionId plus the returned workspace.cwd and the original mode,
allowedPaths, execution, shellCommands, and networkDomains. Sessions are registered against the
canonical project/scope, and simultaneous writers are rejected. Failed writers/resumes are never
automatically replayed. Timeouts/cancellation/schema errors may still leave edits to inspect.

Native Windows exposes no Claude Bash tool. For autonomous allowlisted shell commands, run Node
and Claude inside Linux/WSL2/macOS and explicitly choose execution:sandboxed. The required sandbox
fails closed if unavailable. Use a container when whole-process isolation is needed. This relay's
file scope is enforced through Claude Code permissions, not an OS filesystem boundary.
Sandboxed commands authorize writes within the whole worktree (allowedPaths:["."]); use
execution:codex to retain narrower file scopes. Command auto-approval by sandbox status is disabled.

## Workflows and state

Executable workflow types: claude-review, crosscheck, cross-review, judge-panel. Use workflow or
start with a workflow request. Claims/findings are batched by stable IDs; incomplete stage results
stay unverified. Judge panels rank only candidates with both Claude and supplied independent Codex
scores. [Workflow examples](plugins/ultraclaude/skills/claude-workflow/references/workflow-patterns.md).

Async jobs use a local registry under ~/.ultraclaude (ULTRACLAUDE_STATE_DIR), default concurrency 2
(ULTRACLAUDE_MAX_CONCURRENT), and bounded wait calls. ULTRACLAUDE_WORKTREE_ROOT selects an existing
worktree parent outside the source repo. Tasks and results are retained locally: keep this folder
private. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

All profiles keep safe mode, disabled slash commands, strict MCP isolation, no Chrome, and dontAsk
permissions. Task text travels through stdin without shell interpolation. No recursive delegation
or permission-bypass workflow is offered. The CLI binary is operator-only configuration through
--claude-path or ULTRACLAUDE_CLAUDE_PATH, never a request field.

[Full request/error contract](plugins/ultraclaude/skills/claude-workflow/references/claude-headless.md).

## Development

```sh
npm ci
npm test
npm run build:check
npm run validate:plugin
npm run pack:check
```

Routine tests use fake Claude and consume no model quota. They exercise real worktree edits,
session boundaries, asynchronous jobs, cancellation, schemas, and workflow item coverage.
`npm run build` regenerates the bundled validator. Runtime code has no external npm dependencies.
Package source: plugins/ultraclaude. Marketplace: .agents/plugins/marketplace.json.
See [release steps](docs/releasing.md). Apache-2.0; bundled dependency licenses are in
[THIRD_PARTY_NOTICES.md](plugins/ultraclaude/THIRD_PARTY_NOTICES.md).
