# Contributing

Issues and focused pull requests are welcome. Keep the relay read-only and dependency-free unless
a change has a clear security or interoperability benefit.

Before opening a pull request, run:

```sh
npm test
npm run test:coverage
npm run pack:check
```

Do not use a real Claude model in automated tests. Extend `tests/fixtures/fake-claude.mjs` instead.
Never add Bash, write/edit tools, permission bypasses, dynamic shell prompts, or silent retries that
turn an unverified response into a passed review.

Contributions are accepted under the Apache License 2.0.
