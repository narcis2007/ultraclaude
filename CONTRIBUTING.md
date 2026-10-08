# Contributing

Issues and focused pull requests are welcome. Keep read-only consultation as the default and
require an explicit edit/implement request for writes. The installed runtime must work without
node_modules; rebuild the bundled schema validator when its sources or dependencies change.

Before opening a pull request, run:

```sh
npm test
npm run test:coverage
npm run build:check
npm run validate:plugin
npm run pack:check
```

Do not use a real Claude model in automated tests. Extend `tests/fixtures/fake-claude.mjs` instead.
Keep write permissions scoped to canonical workspace paths. Shell execution must use the
supported OS sandbox and fail closed when it is unavailable. Never add permission bypasses,
dynamic shell prompts, automatic mutation retries, or silent failure-to-pass conversions.

Contributions are accepted under the Apache License 2.0.
