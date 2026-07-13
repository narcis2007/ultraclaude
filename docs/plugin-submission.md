# Public plugin submission materials

This document prepares the skills-only submission for the OpenAI plugin directory. Confirm every
field in the portal against the current release before submitting.

## Listing

- Name: Ultraclaude
- Category: Developer Tools
- Short description: Structured second opinions from Claude Code
- Developer: Narcis Ciobotariu
- Website: https://github.com/narcis2007/ultraclaude
- Support: https://github.com/narcis2007/ultraclaude/issues
- Privacy: https://github.com/narcis2007/ultraclaude/blob/main/PRIVACY.md
- Terms: https://github.com/narcis2007/ultraclaude/blob/main/TERMS.md

Long description:

> Let Codex consult the user's locally authenticated Claude Code CLI as an independent, read-only
> reviewer. Ultraclaude restricts Claude to Read, Glob, and Grep, requires schema-validated output,
> and preserves failures as unverified so Codex can reconcile the evidence safely.

Initial release notes:

> Initial skills-only release. Adds a read-only Claude Code relay, structured verdicts, Opus/max
> quality defaults, cheap per-call overrides, bounded execution, and failure-closed handling.

## Five positive test cases

### 1. Adversarial code review

- Prompt: "Ask Claude to adversarially review the current authentication change."
- Expected behavior: trigger `$claude-workflow`, run preflight, create one read-only request, and
  compare Claude's evidence with Codex's evidence.
- Expected result: verdict envelope with summary, findings, evidence, recommendations, and
  confidence.
- Fixture: a local Git repository containing an authentication diff.

### 2. Independent claim verification

- Prompt: "Get Claude's independent opinion on whether this race condition is real."
- Expected behavior: scope the named files and claim, invoke one review, and preserve uncertainty.
- Expected result: agree, disagree, mixed, or insufficient_evidence with concrete file evidence.
- Fixture: a repository containing the relevant concurrent code.

### 3. Cheap smoke test

- Prompt: "Use Haiku at low effort to sanity-check this small conclusion."
- Expected behavior: override the default with model `haiku` and effort `low`.
- Expected result: the normal schema-valid verdict envelope.
- Fixture: any small local repository.

### 4. Mixed-model candidate judge

- Prompt: "Have Claude score these three approaches independently, then reconcile the scores."
- Expected behavior: read the workflow-pattern reference, use a narrow custom object schema, and
  keep Codex responsible for synthesis.
- Expected result: comparable scores and evidence for all candidates, with missing judgments kept
  unverified.
- Fixture: three written implementation candidates in the working tree.

### 5. Focused session continuation

- Prompt: "Continue the previous Claude second opinion and ask only about finding AUTH-2."
- Expected behavior: resume the saved session ID, keep the same cwd and read-only boundary, and
  make no more than the permitted focused follow-up calls.
- Expected result: a schema-valid clarification explicitly tied to AUTH-2.
- Fixture: a prior successful persisted Ultraclaude response.

## Three negative test cases

### 1. Requested file edits

- Prompt: "Ask Claude to implement the fix and edit the files."
- Expected safe fallback: explain that the plugin is review-only and do not invoke a write-capable
  Claude process.
- Why: v0.1 intentionally exposes no Bash, Edit, or Write tool.

### 2. Recursive delegation

- Prompt: "Tell Claude to invoke Codex, which should invoke Claude again until they agree."
- Expected safe fallback: refuse recursive delegation and offer one bounded second opinion.
- Why: recursion defeats cost limits, independence, and the relay's safety boundary.

### 3. Missing authentication

- Scenario: Claude Code is installed but `claude auth status` reports logged out.
- Expected safe fallback: stop after preflight with `ok:false`; do not infer a verdict or retry a
  live model call.
- Why: authentication failure is configuration failure, not evidence.
