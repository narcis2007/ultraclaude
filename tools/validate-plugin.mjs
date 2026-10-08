import assert from "node:assert/strict";
import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../plugins/ultraclaude/", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.equal(manifest.name, pkg.name); assert.equal(manifest.version, pkg.version);
assert.ok(manifest.interface.displayName.length <= 30);
assert.ok(manifest.interface.shortDescription.length <= 30);
assert.ok(Array.isArray(manifest.interface.capabilities));
for (const relative of [manifest.interface.logo, manifest.interface.composerIcon, pkg.bin.ultraclaude,
  "THIRD_PARTY_NOTICES.md", "skills/claude-workflow/scripts/schema-validator.mjs", "skills/claude-workflow/scripts/windows-job.ps1"]) {
  const resolved = await realpath(path.resolve(root, relative));
  assert.ok(resolved.startsWith(path.resolve(root) + path.sep)); assert.ok((await stat(resolved)).isFile());
}
for (const name of ["claude-ask", "claude-review", "claude-implement", "claude-workflow"]) {
  const file = path.join(root, "skills", name, "SKILL.md");
  const text = await readFile(file, "utf8");
  assert.match(text, new RegExp(`^---\\r?\\nname: ${name}\\r?\\n`));
  assert.match(text, /\ndescription: .+/);
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (!/^[a-z]+:/i.test(match[1])) await stat(path.resolve(path.dirname(file), match[1]));
  }
  await stat(path.join(root, "skills", name, "agents", "openai.yaml"));
}
// Check that the bundled runtime imports and validates a request; release checks also
// install the tarball in an empty directory to verify dependency isolation.
const runtime = await import(new URL("../plugins/ultraclaude/skills/claude-workflow/scripts/claude-node.mjs", import.meta.url));
assert.equal(runtime.SCRIPT_VERSION, pkg.version);
runtime.validateRequest({ prompt: "Offline package validation." });
process.stdout.write("Plugin manifest, assets, four skills, references, and bundled runtime are valid.\n");
