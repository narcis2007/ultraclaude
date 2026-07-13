# Ultraclaude repository guidance

Ultraclaude is a read-only Codex-to-Claude second-opinion plugin.

## Required checks

Run after relevant changes:

    npm.cmd test
    npm.cmd run pack:check
    python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" plugins\ultraclaude\skills\claude-workflow
    python "$env:USERPROFILE\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py" plugins\ultraclaude

## Safety invariants

- Do not add write tools, Bash, permission bypasses, or non-hermetic defaults to v0.1.
- Do not pass dynamic prompts through shell arguments.
- Treat every relay failure as unverified.
- Prevent Claude from calling Codex during a relay run.
- Keep tests offline and use tests/fixtures/fake-claude.mjs.
- Do not make a real Claude model call during routine tests.

## Structure

- Edit the relay in plugins/ultraclaude/skills/claude-workflow/scripts.
- Keep SKILL.md concise; put detailed contracts and patterns in references.
- Keep the root workspace, npm package, plugin manifest, relay, and changelog versions aligned.
- Validate both the skill and plugin before handoff.
- Keep the npm `bin` target in npm-normalized form without a leading `./`. Publish from
  `plugins/ultraclaude` with `--workspaces=false` so the release command is unambiguous.
