# ultraclaude

Ultraclaude is a Codex plugin and a small command-line relay that asks the user's locally
authenticated Claude Code CLI for structured, read-only second opinions.

It defaults to Claude `opus` at `max` effort. Override both per request when a cheaper check is
appropriate:

```json
{
  "prompt": "Review this conclusion and cite concrete evidence.",
  "cwd": "C:\\absolute\\path\\to\\repo",
  "model": "haiku",
  "effort": "low",
  "persistSession": false
}
```

After installing Claude Code and authenticating it, run:

```sh
npx ultraclaude preflight --pretty
npx ultraclaude dry-run --request request.json --pretty
npx ultraclaude run --request request.json --pretty
```

The relay enables Claude safe mode, removes write and shell tools, uses `dontAsk`, and requires
JSON Schema output. A failed, timed-out, or malformed review is returned as unverified.

For Codex plugin installation and the complete security model, see the
[repository documentation](https://github.com/narcis2007/ultraclaude).

Ultraclaude is an independent project and is not affiliated with, endorsed by, or maintained by
Anthropic or OpenAI. Claude and Codex are trademarks of their respective owners.
