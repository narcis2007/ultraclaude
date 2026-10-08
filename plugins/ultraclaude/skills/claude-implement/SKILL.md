---
name: claude-implement
description: Delegate an implementation, fix, or refactor to Claude Code from Codex, with explicit write paths, an isolated git worktree, persistent follow-ups, and independent Codex verification. Use when the user asks Claude to write or implement; use claude-review for inspection only.
---

# Delegate implementation to Claude

Runner: `<SKILL_DIR>/../claude-workflow/scripts/claude-node.mjs`. Codex owns the finished result.
Run preflight; file writes require the current CLI and the scoped write controls reported there.

Write a brief with goal, relevant repository rules, allowed files, acceptance criteria, and exact
verification commands. Safe mode does not load repository instructions automatically: put the
applicable reviewed rules in the brief. Save the brief with a file-writing tool, not shell interpolation.

```json
{
  "taskFile":"/absolute/brief.txt",
  "cwd":"/absolute/source-repo",
  "mode":"implement",
  "tier":"daily",
  "allowedPaths":["src","tests"],
  "persistSession":true
}
```

Inspect dry-run, then start the job and poll wait/status. The runner creates a sibling git worktree
and claude/<runId> branch; it never merges, commits, pushes, or removes partial work. A dirty source
is refused because a worktree would omit its changes. Do not stash or commit someone else's work
to satisfy this check. If the user's established scope authorizes editing the current tree directly,
select isolation:direct deliberately; otherwise resolve the source baseline with them.

Native Windows uses execution:codex: Claude edits files and reports checks for Codex to execute.
Read [execution options](../claude-workflow/references/claude-headless.md) before enabling shell
commands inside Linux/WSL2/macOS. Do not use native unsandboxed Claude shell or permission bypass.

Inspect result.workspace, actual git status/diff, and every task claimed done. Run the acceptance
checks yourself; tests claimed by Claude are not independent verification. A timeout, cancellation,
permission error, or schema failure can leave useful partial edits. Inspect before continuing;
mutating requests are never automatically retried.

Resume with the registered sessionId and returned workspace.cwd, repeating the original mode,
execution, allowedPaths, shellCommands, and networkDomains. A follow-up cannot widen permissions.
Fix confirmed issues, verify again, and integrate according to the user's existing authorization.
Report the branch/path, what was actually verified, and remaining limitations.
