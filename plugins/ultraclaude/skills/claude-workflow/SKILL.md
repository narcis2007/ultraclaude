---
name: claude-workflow
description: Obtain an independent, structured second opinion from Claude Code through the bundled headless relay while Codex remains the orchestrator. Use when the user asks Codex to ask, consult, involve, or interact with Claude; requests Claude's opinion, review, verification, judgment, or counterargument; wants cross-model adversarial review or a mixed-model panel; or wants to continue a Claude second-opinion session. Default to read-only, hermetic review. Do not use for autonomous Claude file edits, open-ended delegation, image generation, or a documentation-only question that does not require a live Claude call.
---

# Claude Workflow

Use Claude as an independent reviewer, not as a replacement orchestrator. Keep Codex responsible
for scoping the question, checking evidence, and synthesizing the final answer.

## Resolve the relay

Set SKILL_DIR to the directory containing this file. Use:

    node "<SKILL_DIR>/scripts/claude-node.mjs" <command>

Never call claude through an interpolated shell prompt. The relay passes the task through stdin and
invokes the resolved native executable without a shell.

## Run the workflow

1. Decide whether a live second model adds material value. If the user only asks how the
   integration works, explain it without making a model call.
2. Run preflight once per Codex thread before the first live call:

       node "<SKILL_DIR>/scripts/claude-node.mjs" preflight --pretty

   Preflight checks the executable, authentication, and required flags without making a model call.
   Stop if ok is false.
3. Define one narrow, independently verifiable task. Name files and claims instead of pasting large
   repository contents.
4. Create a temporary JSON request with a file-writing tool. Do not build it through shell string
   interpolation. Use this minimal quality-first shape; the relay defaults to Opus at max effort:

       {
         "prompt": "Adversarially review the current change and cite concrete file evidence.",
         "cwd": "C:\\absolute\\path\\to\\repo",
         "timeoutSec": 300,
         "persistSession": false
       }

   For a cheap sanity check or smoke test, add `"model":"haiku"` and `"effort":"low"`.

5. Inspect the invocation without spending quota when the request is new or unusual:

       node "<SKILL_DIR>/scripts/claude-node.mjs" dry-run --request "<request.json>" --pretty

6. Run exactly one call initially:

       node "<SKILL_DIR>/scripts/claude-node.mjs" run --request "<request.json>" --pretty

7. Treat ok:false as unverified. Never convert an error, timeout, missing result, or malformed JSON
   into agreement or a passed review.
8. Compare Claude's output with Codex's evidence. Report agreements, disagreements, and unresolved
   items explicitly. A second model is evidence, not authority.
9. Remove the temporary request if it was created inside the user's repository.

## Preserve read-only isolation

The relay always uses safe mode, disables slash commands, uses strict MCP isolation, uses dontAsk
permissions, and exposes only Read, Glob, and Grep. It disables session persistence unless
explicitly requested. It does not expose a write-mode option.

Do not bypass these controls by invoking Claude directly. If the user asks Claude to implement or
edit files, explain that v0.1 supports review only and ask whether to design a separately isolated
write workflow.

## Use structured output

Omit schema to use the built-in verdict contract:

- verdict: agree, disagree, mixed, or insufficient_evidence
- summary: concise conclusion
- findings: severity, title, evidence, and recommendation
- confidence: integer from 0 to 100

Supply a custom object JSON Schema only when the downstream aggregation requires another shape.
Keep it small and fail closed if structured_output is absent.

Read references/claude-headless.md for the full request contract, error taxonomy, executable
resolution, and direct diagnostic commands.

## Continue a session sparingly

For a genuine follow-up:

1. Set persistSession:true on the first request.
2. Store sessionId from the successful relay result.
3. Create a new request with resumeSessionId set to that value.
4. Keep the same working directory and read-only boundary.
5. Limit autonomous back-and-forth to three Claude calls unless the user explicitly requests more.

Do not ask Claude to call Codex. The relay uses safe mode and a system guardrail to prevent
recursive Claude to Codex to Claude loops.

Read references/workflow-patterns.md before building a judge panel, adversarial verification
pipeline, or multi-turn exchange.

## Route effort intentionally

- The default is Opus at max effort for a quality-first, load-bearing second opinion.
- Override with Haiku at low or medium effort for a cheap sanity check or smoke test.
- Override with another available model/effort only when the user requests a different cost/quality
  tradeoff.

Tell the user when a live call is being made and honor an explicit model, effort, timeout, or budget
request. Do not silently downshift the default.

## Handle failures

The relay returns a stable error kind:

- invalid_request, cli_not_found, auth, usage_limit, model, budget, permission, or schema: fix
  configuration; do not retry
- parse or output_limit: narrow the task or schema; do not silently retry
- rate_limit, network, server, or timeout: one delayed retry is reasonable
- execution or spawn: inspect the diagnostic and stop

Preserve the relay's retryable field. Never retry immediately after a rate limit.
