# Claude headless relay reference

## Contents

1. Request contract
2. Security boundary
3. Output contract
4. Commands
5. Executable resolution
6. Error taxonomy
7. Limits and operational notes

## 1. Request contract

Pass a JSON object through a file or through stdin with --request -.

| Field | Type | Required | Default | Meaning |
|---|---|---:|---|---|
| prompt | string | yes | none | Task delivered to Claude through stdin |
| cwd | string | no | relay process cwd | Readable working tree |
| schema | object JSON Schema | no | built-in verdict | Required structured output |
| model | string | no | opus | Per-call model override |
| effort | low, medium, high, xhigh, max | no | max | Reasoning effort |
| timeoutSec | integer 1..1800 | no | 300 | Wall-clock process timeout |
| maxBudgetUsd | number 0..100 | no | unset | API-billed print-mode guard |
| persistSession | boolean | no | false | Preserve the Claude session |
| resumeSessionId | string | no | unset | Continue a preserved session |

Unknown fields are rejected. The request JSON cannot choose an executable. Prompts are capped at
2 MiB, schemas at 24 KiB, request files at roughly 2.1 MiB, and combined process output at 4 MiB.

The built-in schema is printed by:

    node claude-node.mjs schema --pretty

An example request is printed by:

    node claude-node.mjs example-request --pretty

## 2. Security boundary

Every live request uses:

- --safe-mode to disable CLAUDE.md, skills, plugins, hooks, MCP servers, and other customizations
- --disable-slash-commands and --strict-mcp-config as defense in depth
- --permission-mode dontAsk
- --tools Read,Glob,Grep
- --allowed-tools Read,Glob,Grep
- --no-chrome
- a system guardrail that forbids delegation, writes, shell commands, and external actions
- --no-session-persistence unless persistence or resume was requested

The relay has no write-mode request field. Repository contents are treated as evidence rather than
instructions. This reduces prompt-injection and recursion risk but does not make model output
authoritative.

The Claude CLI itself still writes its normal local logs or session metadata when persistence is
enabled. Read-only refers to model-driven workspace actions.

## 3. Output contract

A successful relay result has:

    {
      "ok": true,
      "output": { "...schema-conforming object..." },
      "sessionId": "optional-session-id",
      "stats": {
        "durationMs": 1234,
        "apiDurationMs": 1000,
        "turns": 1,
        "costUsd": 0.01
      }
    }

Fields unavailable from the active authentication surface are null.

A failure has:

    {
      "ok": false,
      "error": {
        "kind": "auth",
        "message": "sanitized diagnostic",
        "retryable": false,
        "exitCode": 1
      }
    }

Codex must partition failed reviews as unverified.

## 4. Commands

Preflight, no model call:

    node claude-node.mjs preflight --pretty

Dry run, no model call:

    node claude-node.mjs dry-run --request request.json --pretty

Live structured review:

    node claude-node.mjs run --request request.json --pretty

Read the request from stdin:

    node claude-node.mjs run --request -

Print help:

    node claude-node.mjs --help

## 5. Executable resolution

Resolution order:

1. operator-only --claude-path CLI option
2. ULTRACLAUDE_CLAUDE_PATH
3. the native Claude executable under the Windows npm installation
4. claude found on PATH

On Windows, PowerShell may select claude.ps1 and reject it under a restrictive execution policy.
The relay avoids that path. It resolves the native claude.exe behind claude.cmd. A cmd, bat, or
PowerShell wrapper is never invoked with dynamic schema content through a shell.

For a nonstandard install, set:

    ULTRACLAUDE_CLAUDE_PATH=C:\absolute\path\to\claude.exe

JavaScript Claude entry points are supported and are launched through the current Node executable.

## 6. Error taxonomy

| Kind | Retryable | Action |
|---|---:|---|
| invalid_request | no | Correct request fields or bounds |
| cli_not_found | no | Install Claude Code or configure its path |
| auth | no | Run interactive Claude authentication |
| usage_limit | no | Wait for the account allowance to reset or change account |
| model | no | Choose a model/effort combination available to the account |
| budget | no | Raise an intentional budget or narrow the task |
| permission | no | Keep the read-only scope or inspect configuration |
| schema | no | Fix or simplify the JSON Schema |
| parse | no | Inspect CLI compatibility and output |
| output_limit | no | Narrow the task |
| rate_limit | yes | Back off, then retry once |
| network | yes | Check connectivity, then retry once |
| server | yes | Back off, then retry once |
| timeout | yes | Narrow the task or retry once with a justified timeout |
| spawn | no | Fix executable/runtime configuration |
| execution | no | Inspect the diagnostic |

## 7. Limits and operational notes

- Use file paths and a cwd for large reviews instead of embedding file content.
- Opus/max is the quality-first default; use Haiku/low explicitly for cheap checks.
- Keep concurrency at two Claude calls or fewer until local rate behavior is measured.
- Use one model family to challenge the other, not to rubber-stamp it.
- Keep a persistent session only for real follow-up dialogue.
- Never pass secrets in prompt, schema, request filenames, or error output.
- maxBudgetUsd is most useful with API-billed authentication; subscription behavior may differ.
