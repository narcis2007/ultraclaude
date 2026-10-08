# Releasing Ultraclaude

## Preflight

1. Align the version in the root workspace, npm package, plugin manifest, relay constant,
   package lock, and changelog.
2. Run `npm test`, `npm run test:coverage`, `npm run build:check`, `npm run validate:plugin`, `npm run pack:check`, and `npm audit --omit=dev`.
3. Run the available official Codex skill validator for all four skills and the repository plugin validator; use the official plugin validator too when installed.
4. Install the generated tarball in an empty directory and execute `schema`, `preflight`, and
   `dry-run` through its generated npm bin shim.
5. Run one explicitly approved live smoke test on Haiku without an effort field.

## npm

Publish from the package directory, not through npm's workspace publish path:

```sh
cd plugins/ultraclaude
npm publish --dry-run --access public --workspaces=false
npm publish --access public --workspaces=false
```

Keep the `bin` target in npm-normalized form (`skills/...`, without a leading `./`). npm 11 rewrites
the noncanonical form even during `publish --dry-run`, which can otherwise leave a dirty worktree.
The directory-local command above and the workspace form produce the same tarball after this
normalization; the directory-local form is the verified release path used here.

After publishing, verify `npm view ultraclaude version`, install the registry package in an empty
directory, and run its `schema` and `preflight` commands.

## GitHub and Codex

1. Push the release commit to `main` and wait for CI.
2. Create and push the matching `v<version>` tag.
3. Confirm `codex plugin marketplace add narcis2007/ultraclaude` and
   `codex plugin add ultraclaude@ultraclaude` from a clean Codex profile.
4. Submit the final skill bundle and the cases in `plugin-submission.md` through the OpenAI plugin
   submission portal when the publisher identity and Apps Management permission are ready.
