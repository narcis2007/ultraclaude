# Ultraclaude 0.2

Claude Code inside Codex: consultation, independent review, isolated implementation, sessions,
asynchronous jobs, and cross-model workflows. Codex verifies and owns the result.

Skills: claude-ask, claude-review, claude-implement, claude-workflow.
Runner: skills/claude-workflow/scripts/claude-node.mjs (also the ultraclaude npm CLI).

Default legacy requests stay read-only Opus/max. Typed daily requests use Sonnet 5.5/xhigh;
final uses Opus 5.5/max; light uses Haiku without effort; deep explicitly selects Fable 5.1/xhigh.
Account availability is not inferred from the catalog. Actual modelUsage is retained.

Writing is opt-in through mode:edit/implement and defaults to an isolated git worktree.
Native Windows delegates build/test commands to Codex. Autonomous shell requires an available
sandbox inside Linux/WSL2/macOS; no permission-bypass mode is offered.

Run preflight and dry-run before live use. See the repository README and the skill references
for full request contracts, job controls, and data handling. The bundled validator works without
npm dependencies in a skills-only installation. See THIRD_PARTY_NOTICES.md.
