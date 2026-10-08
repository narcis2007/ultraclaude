# Ultraclaude repository guidance

Ultraclaude v0.2 supports Claude consultation and opt-in isolated implementation from Codex.

## Required checks

Run after relevant changes:

    npm.cmd test
    npm.cmd run build:check
    npm.cmd run pack:check
    npm.cmd run validate:plugin

Validate each changed skill with the available skill-creator quick_validate.py. Use an official
plugin validator when installed; the repository validator covers this skills-only package otherwise.

## Boundaries

- Preserve legacy read-only Opus/max requests. Writing requires edit/implement mode.
- Keep safe mode, strict MCP isolation, dontAsk permissions, and recursion prevention.
- Use path-scoped Edit rules for Edit and Write; never add a bare write allow or bypassPermissions.
- Native Windows exposes no Claude shell tool. Sandboxed shell execution must fail if unavailable.
- Bind resumed sessions to the canonical workspace and original permission scope.
- Treat relay failures and schema mismatches as unverified; mutating runs are never replayed automatically.
- Pass task text through stdin, never dynamic shell arguments. Never kill unrelated Claude sessions.
- Keep tests offline using tests/fixtures/fake-claude.mjs; routine tests make no real model calls.

## Structure

- Runtime modules live in plugins/ultraclaude/skills/claude-workflow/scripts.
- Keep skills concise and move contracts into references.
- Generate schema-validator.mjs with npm run build. Ship the bundle and third-party license notices;
  an installed skills-only plugin must not depend on node_modules.
- Align workspace, npm, manifest, relay, lockfile, and changelog versions.
- Keep the npm bin target without ./; publish from plugins/ultraclaude with --workspaces=false.
