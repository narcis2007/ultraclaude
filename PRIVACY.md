# Privacy policy

Effective: 13 July 2026

Ultraclaude is local, open-source software. It does not operate a hosted service, create an author
account, use analytics, or send data to the project author.

When a user requests a live review, Ultraclaude launches the Claude Code CLI already installed and
authenticated on that user's machine. The task prompt and any repository content Claude reads are
processed by the provider configured in Claude Code. That provider's terms, privacy policy,
retention controls, and model-training preferences apply.

Ultraclaude limits model-visible tools to `Read`, `Glob`, and `Grep`. It does not intentionally
collect secrets. Users are responsible for selecting an appropriate working directory and for not
placing credentials, personal information, or other sensitive data in prompts or readable files.

By default, Ultraclaude disables Claude session persistence. If a user explicitly enables
persistence, Claude Code may store session metadata under its own local application data. Claude
Code may also write its ordinary logs or operational metadata independently of Ultraclaude.

Questions or privacy reports can be opened at
<https://github.com/narcis2007/ultraclaude/issues>.
