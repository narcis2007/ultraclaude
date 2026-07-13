# Security policy

## Supported versions

Security fixes are provided for the latest published version.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public
issue containing exploit details, credentials, private repository content, or Claude session IDs.

Include the affected version, platform, Claude Code version, reproduction steps, and the security
boundary you believe was crossed. Reports involving arbitrary command execution, file writes,
secret disclosure, prompt injection that escapes safe mode, or malformed-output acceptance are
treated as high priority.

## Intended boundary

Ultraclaude permits only Claude's `Read`, `Glob`, and `Grep` tools. It does not provide Bash, edit,
write, browser, MCP, or permission-bypass functionality. A model conclusion is untrusted data even
when it satisfies the requested schema.
