import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SCRIPT_VERSION } from "../plugins/ultraclaude/skills/claude-workflow/scripts/claude-node.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pluginRoot = path.join(root, "plugins", "ultraclaude");

async function text(relative) {
  return await readFile(path.join(root, relative), "utf8");
}

async function json(relative) {
  return JSON.parse(await text(relative));
}

test("release versions remain aligned", async () => {
  const workspace = await json("package.json");
  const npmPackage = await json("plugins/ultraclaude/package.json");
  const plugin = await json("plugins/ultraclaude/.codex-plugin/plugin.json");
  const lock = await json("package-lock.json");

  assert.equal(workspace.version, SCRIPT_VERSION);
  assert.equal(npmPackage.version, SCRIPT_VERSION);
  assert.equal(plugin.version, SCRIPT_VERSION);
  assert.equal(lock.version, SCRIPT_VERSION);
  assert.equal(lock.packages["plugins/ultraclaude"].version, SCRIPT_VERSION);
  assert.match(await text("CHANGELOG.md"), new RegExp(`## ${SCRIPT_VERSION}\\b`));
});

test("public marketplace has a stable unique identity", async () => {
  const marketplace = await json(".agents/plugins/marketplace.json");
  assert.equal(marketplace.name, "ultraclaude");
  assert.equal(marketplace.interface.displayName, "Ultraclaude");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, "ultraclaude");
  assert.deepEqual(marketplace.plugins[0].source, {
    source: "local",
    path: "./plugins/ultraclaude",
  });
  assert.equal(marketplace.plugins[0].policy.installation, "AVAILABLE");
  assert.equal(marketplace.plugins[0].policy.authentication, "ON_INSTALL");
});

test("npm package is publishable and contains a valid plugin entry point", async () => {
  const workspace = await json("package.json");
  const npmPackage = await json("plugins/ultraclaude/package.json");
  assert.equal(workspace.private, true);
  assert.equal(npmPackage.private, undefined);
  assert.equal(npmPackage.name, "ultraclaude");
  assert.equal(
    npmPackage.exports["."],
    "./skills/claude-workflow/scripts/claude-node.mjs"
  );
  assert.equal(
    npmPackage.bin.ultraclaude,
    "skills/claude-workflow/scripts/claude-node.mjs"
  );

  for (const relative of [
    ".codex-plugin/plugin.json",
    "skills/claude-workflow/SKILL.md",
    "skills/claude-workflow/scripts/claude-node.mjs",
    "assets/ultraclaude.svg",
    "LICENSE",
    "NOTICE",
    "README.md",
  ]) {
    const target = path.join(pluginRoot, relative);
    await access(target);
    assert.equal((await stat(target)).isFile(), true, `${relative} must be a file`);
  }
});

test("plugin metadata exposes legal links and only the read capability class", async () => {
  const plugin = await json("plugins/ultraclaude/.codex-plugin/plugin.json");
  assert.deepEqual(plugin.interface.capabilities, ["Read"]);
  assert.match(plugin.interface.privacyPolicyURL, /^https:\/\//);
  assert.match(plugin.interface.termsOfServiceURL, /^https:\/\//);
  await access(path.join(pluginRoot, plugin.interface.logo));
  await access(path.join(pluginRoot, plugin.interface.composerIcon));
});

test("public instructions contain no machine-specific Narcis workspace path", async () => {
  for (const relative of [
    "README.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "plugins/ultraclaude/README.md",
    "plugins/ultraclaude/skills/claude-workflow/SKILL.md",
    "plugins/ultraclaude/skills/claude-workflow/references/claude-headless.md",
  ]) {
    assert.doesNotMatch(await text(relative), /C:\\Users\\Narcis|Narcis\\Workspace/i);
  }
});
