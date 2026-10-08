# Changelog

## 0.2.1 - 2026-10-08

- Light tier: Claude Haiku 5.5 at medium effort (was Haiku 4.5 without effort). On a code
  verification task it matched Haiku 4.5 (6/6) at a fraction of the cost and 3-6x faster.
- The `haiku` alias is Haiku 5.5 with low through max effort, as Claude Code resolves it.
  Without an explicit effort it runs at medium, also on the legacy max route (on review triage,
  max cost about 15x and took about 8x longer than high without better verdicts);
  Haiku 4.5 stays available by id (`claude-haiku-4-5-20251001`, `claude-haiku-4-5`) without
  effort. Provider aliases (Bedrock, Vertex, Foundry) keep Haiku 4.5 semantics until pinned.

## 0.2.0 - 2026-10-07

- Opt-in edit/implement profiles, automatic git worktrees, and scoped file permissions.
- Sonnet/Opus/Haiku/Fable routing, per-model effort validation, and usage provenance.
- Bundled JSON Schema validation, presets, task files, and text answers.
- Registered sessions, workspace leases, asynchronous jobs, cancellation, and process-tree cleanup.
- Claude ask/review/implement skills and executable review, crosscheck, cross-review, and judge workflows.
- Native Windows uses Codex for commands; shell tools require an available sandbox on Linux/WSL2/macOS.

## 0.1.0 - 2026-07-13

- Initial Codex plugin and npm CLI release.
- Read-only Claude Code relay with structured output and failure-closed errors.
- Opus/max quality defaults with per-request model and effort overrides.
- Safe mode, strict MCP isolation, bounded input/output, and optional session continuation.
