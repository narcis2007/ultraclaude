---
name: claude-review
description: Obtain an adversarial Claude Code review of a change from Codex, then verify its findings against the actual code. Use for independent code review, security review, or several review lenses; use claude-ask for one small question.
---

# Independent Claude review

Runner: `<SKILL_DIR>/../claude-workflow/scripts/claude-node.mjs`. Preflight before live use.
Define the exact branch, commit, files, or uncommitted change in the prompt; Claude has file-reading
tools but no shell in a review. Supply a diff in the task when git evidence is needed.

For one pass use kind:review and schemaPreset:review. For lenses write:

```json
{"workflow":"claude-review","cwd":"/absolute/repo","prompt":"Review the supplied change in named files.","lenses":["code","security","tests"]}
```

Start the job and poll wait/status. Ordinary lenses use Sonnet 5.5/xhigh; security uses Opus 5.5/max.
An explicit tier overrides every lens. Actual observed models appear separately from requested
routing; do not conceal fallback or treat configured capability as confirmed account access.

Verify material findings yourself. Mark them confirmed, refuted, or unverified, preserving IDs.
Batch disputed findings in a cross-review or crosscheck request. Escalate the consequential
unresolved item rather than rerunning whole reviews until agreement appears. Codex owns severity,
verification, and synthesis. See [workflow contracts](../claude-workflow/references/workflow-patterns.md).
