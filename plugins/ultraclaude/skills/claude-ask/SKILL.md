---
name: claude-ask
description: Ask the locally authenticated Claude Code CLI one focused question, request a second opinion, or verify a named claim from Codex. Use for a single consultation rather than a multi-stage review or delegated implementation.
---

# Ask Claude

Runner: `<SKILL_DIR>/../claude-workflow/scripts/claude-node.mjs`.
Run preflight once before live use. State the question and name the evidence/files Claude should
inspect. Write a JSON request with prompt, absolute cwd, kind:ask, and schemaPreset:ask.
For claim verification use kind:verify and schemaPreset:verify, with stable IDs in the prompt.
For a free-text reply use schemaPreset:none. Typed requests default to Sonnet 5.5/xhigh;
an explicit user model/effort wins. Haiku accepts no effort field.

Inspect `dry-run --request <file>` when using a new combination. Use `run --request <file>` for
a short exchange or `start` followed by `wait <runId> --max-wait 10` for a longer one. Prompts travel
through stdin, never an interpolated shell command. Announce live calls; failed calls provide no
agreement. Reconcile Claude's answer with Codex's evidence.

For follow-up context, enable persistSession:true initially and resume the returned sessionId in
the same cwd/mode. Do not broaden permissions or invoke recursive model delegation.
See [request details](../claude-workflow/references/claude-headless.md) when needed.
