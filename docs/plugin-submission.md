# Public plugin submission cases ? v0.2

Skills-only package, Developer Tools, Ultraclaude. Listing metadata lives in the plugin manifest;
privacy/terms and independent-project disclosures must match this release.

## Positive cases

1. One focused question invokes claude-ask, uses a typed read-only request, and reconciles evidence.
2. A code review invokes claude-review; security routes to final unless an explicit tier overrides it.
3. A delegated fix invokes claude-implement: real sibling worktree, scoped edits, independent Codex checks.
4. A crosscheck verifies every stable claim ID; judge-panel ranks only candidates with both judgments.
5. A persisted follow-up resumes the returned workspace/session with the original scope.
6. Haiku smoke requests omit effort; unsupported effort is rejected before inference.
7. An asynchronous implementation can be polled/cancelled; partial files remain reviewable.

## Negative cases

- Legacy review requests asking for writes still expose only read tools.
- Recursive Claude/Codex delegation is unavailable.
- A resumed session with different cwd/mode/allowed paths is refused.
- Path traversal or an escaping junction in an allowed write path is refused.
- Native Windows sandboxed-shell requests are refused rather than silently executed unsandboxed.
- Missing authentication stops at preflight; missing/invalid structured results remain unverified.
- Invented, duplicate, or omitted workflow item IDs fail the stage.
- Dirty source repositories are refused before creating a worktree.

Use offline fixtures for routine validation. Live tests send prompts/files to the user's provider
and require the applicable explicit authorization. Do not submit or publish merely by running tests.
