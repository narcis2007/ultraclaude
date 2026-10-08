# Privacy policy

Effective: 7 October 2026

Ultraclaude runs locally and operates no author-hosted service, analytics, or author account.
Live requests use the user's installed/authenticated Claude Code CLI. Task prompts and the file
content Claude reads are processed by the configured provider under that account's terms,
retention, and training controls. Selecting a model does not change that destination.

Review profiles read files. Opt-in edit/implement profiles also modify authorized workspace paths.
Sandboxed execution may contact explicitly allowed network hosts. Native Windows verification
commands run through Codex's tools. Keep secrets out of prompts and model-readable files.

Claude session persistence is off by default; persistent sessions use Claude's own local storage.
Async jobs and persistent session scopes create a local ~/.ultraclaude registry (or the operator's
ULTRACLAUDE_STATE_DIR). It contains task requests, results, workspace information, model usage, and
minimal progress events. These records are not uploaded to the author. Claude can independently
write its ordinary operational logs. Retained worktrees and partial changes are not removed
without a separate cleanup action.

Privacy questions: https://github.com/narcis2007/ultraclaude/issues
