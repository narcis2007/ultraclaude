# Ultraclaude

[![CI](https://github.com/narcis2007/ultraclaude/actions/workflows/ci.yml/badge.svg)](https://github.com/narcis2007/ultraclaude/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ultraclaude)](https://www.npmjs.com/package/ultraclaude)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

> Codex orchestrates. Claude cross-checks.

Ultraclaude is a Codex plugin that asks the user's locally installed Claude Code CLI for an
independent, structured second opinion. Codex retains the task context and final synthesis; Claude
runs as a read-only reviewer through its official headless CLI.

Ultraclaude is an independent project. It is not affiliated with, endorsed by, or maintained by
Anthropic or OpenAI. Claude and Codex are trademarks of their respective owners.

## What it does

- adversarial code reviews and second opinions across model families
- read-only repository inspection using only Claude's `Read`, `Glob`, and `Grep` tools
- JSON Schema output with an explicit failure-closed envelope
- optional, deliberate follow-up sessions
- no autonomous implementation, shell tool, third-party MCP server, or hosted relay

## Defaults and cost control

The normal quality-first defaults are:

| Setting | Default |
|---|---|
| Claude model | `opus` |
| Effort | `max` |
| Timeout | 300 seconds |
| Session persistence | disabled |

Every live call consumes the allowance or API budget of the user's own Claude Code account. For a
cheap check or smoke test, set `"model": "haiku"` and `"effort": "low"` in the request.

## Prerequisites

- Codex with plugin support
- Node.js 18 or newer
- [Claude Code](https://code.claude.com/docs/en/quickstart) installed and authenticated

Run `claude auth status` first if Claude Code has not been used on the machine yet.

## Install as a Codex plugin

Add the GitHub repository as a marketplace and install the plugin:

```sh
codex plugin marketplace add narcis2007/ultraclaude
codex plugin add ultraclaude@ultraclaude
```

Start a new Codex thread after installation. Example prompts:

- Ask Claude to adversarially review this change.
- Get Claude's read-only opinion on the authentication conclusion.
- Have Claude judge these alternatives independently, then reconcile the evidence.

For local development from a clone:

```sh
codex plugin marketplace add .
codex plugin add ultraclaude@ultraclaude
```

## Use the npm CLI directly

The npm package contains the same plugin tree and exposes the relay as `ultraclaude`:

```sh
npx ultraclaude preflight --pretty
npx ultraclaude example-request --pretty
npx ultraclaude dry-run --request request.json --pretty
npx ultraclaude run --request request.json --pretty
```

Minimal request using the quality-first defaults:

```json
{
  "prompt": "Adversarially review the current change and cite concrete file evidence.",
  "cwd": "/absolute/path/to/repo",
  "persistSession": false
}
```

Cheap request:

```json
{
  "prompt": "Sanity-check this narrow conclusion.",
  "cwd": "/absolute/path/to/repo",
  "model": "haiku",
  "effort": "low",
  "timeoutSec": 120,
  "persistSession": false
}
```

## Security boundary

Every live request uses Claude Code with:

- `--safe-mode` and `--disable-slash-commands`
- `--strict-mcp-config` and `--no-chrome`
- `--permission-mode dontAsk`
- only `Read`, `Glob`, and `Grep`
- no session persistence unless explicitly requested
- a fixed system guardrail and a dynamic task passed through stdin, never a shell

The request JSON cannot select an executable. An operator can configure a nonstandard Claude Code
installation only through the CLI's `--claude-path` option or the
`ULTRACLAUDE_CLAUDE_PATH` environment variable.

These controls reduce workspace side effects, prompt injection, and recursive model delegation.
They do not make model output authoritative. Codex must independently reconcile Claude's evidence,
and every failed or malformed review remains unverified.

## Data and privacy

Ultraclaude has no server and sends nothing to its author. The local Claude Code CLI sends the
prompt and any repository content Claude reads to the provider configured in the user's Claude
Code installation. Provider retention and training settings therefore follow that account. See
[PRIVACY.md](PRIVACY.md) before using the plugin with confidential repositories.

## Development

Routine tests use a fake Claude executable and consume no model quota:

```sh
npm test
npm run test:coverage
npm run preflight
npm run dry-run
npm run pack:check
```

The release package lives at `plugins/ultraclaude`; its manifest and package version must remain
aligned. The repository also contains the Codex marketplace at
`.agents/plugins/marketplace.json`.

## Publishing surfaces

- GitHub repository marketplace for Codex CLI, IDE, and desktop installations
- npm package for the direct CLI and npm-backed Codex marketplace entries
- the public OpenAI plugin directory after review through the
  [plugin submission portal](https://platform.openai.com/plugins)

Submission materials and reviewer test cases are maintained in
[docs/plugin-submission.md](docs/plugin-submission.md).
Maintainer release steps are in [docs/releasing.md](docs/releasing.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
