# Security policy

Security fixes target the latest published release. Report vulnerabilities privately through
GitHub; do not post secrets, private code, or session IDs in public issues.

## Intended boundary

Legacy requests are read-only. Writing requires an explicit edit/implement profile, scoped file
permissions, and a worktree by default. Git/agent configuration is write-protected. Session
continuation cannot widen the original scope. Codex verifies results before integration.

Safe mode disables user customizations; managed policy still applies. The relay does not expose
permission bypass, arbitrary native Windows shell, Chrome, MCP, or recursive delegation.
File-tool restrictions are Claude Code permission rules, not an OS filesystem sandbox. Native
Windows uses Codex for commands. Sandboxed shell profiles require Linux/WSL2/macOS and fail when
sandboxing is unavailable. A container can further isolate the complete Claude process.

The runner validates schemas and outputs, bounds input/output/time/turns, serializes workspace
writers, and cancels only owned process trees. Provider responses remain untrusted conclusions.
Async requests and session scope live in an operator-owned local state directory; protect that
folder. Model selection changes no permissions. Cataloged capabilities do not prove account access.
