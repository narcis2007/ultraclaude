#!/usr/bin/env node

import process from "node:process";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);

if (args.includes("--version")) {
  process.stdout.write("2.1.293 (Fake Claude Code)\n");
  process.exit(0);
}

if (args.includes("--help")) {
  process.stdout.write(
    [
      "--print",
      "--safe-mode",
      "--disable-slash-commands",
      "--strict-mcp-config",
      "--no-chrome",
      "--permission-mode",
      "--tools",
      "--allowedTools",
      "--json-schema",
      "--output-format",
      "--append-system-prompt",
      "--no-session-persistence",
      "--model",
      "--effort",
      "--max-budget-usd",
      "--resume",
      "--settings", "--setting-sources", "--max-turns", "--verbose",
    ].join("\n") + "\n"
  );
  process.exit(0);
}

if (args[0] === "auth" && args[1] === "status") {
  process.stdout.write(
    JSON.stringify({
      loggedIn: true,
      authMethod: "fixture",
      apiProvider: "fixture",
    }) + "\n"
  );
  process.exit(0);
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const prompt = Buffer.concat(chunks).toString("utf8");

const requiredArgs = [
  "--print",
  "--safe-mode",
  "--disable-slash-commands",
  "--strict-mcp-config",
  "--no-chrome",
  "--permission-mode",
  "--tools",
  "--allowed-tools",
  "--output-format",
  "--append-system-prompt",
  "--model",
];
const missingArgs = requiredArgs.filter((arg) => !args.includes(arg));
if (missingArgs.length > 0) {
  process.stderr.write("Missing required relay arguments: " + missingArgs.join(", ") + "\n");
  process.exit(1);
}

if (prompt.includes("__FAIL_AUTH__")) {
  process.stderr.write("Authentication required. Run claude auth login.\n");
  process.exit(1);
}

if (prompt.includes("__MALFORMED__")) {
  process.stdout.write("not-json\n");
  process.exit(0);
}

if (prompt.includes("__FAIL_USAGE__")) {
  process.stderr.write("You've hit your weekly usage limit.\n");
  process.exit(1);
}

if (prompt.includes("__FAIL_NETWORK__")) {
  process.stderr.write("Network error: ECONNRESET.\n");
  process.exit(1);
}

if (prompt.includes("__FAIL_MODEL__")) {
  process.stderr.write("The requested model is not supported.\n");
  process.exit(1);
}

if (prompt.includes("__NO_STRUCTURED__")) {
  process.stdout.write(
    JSON.stringify({ type: "result", subtype: "success", is_error: false }) + "\n"
  );
  process.exit(0);
}

if (prompt.includes("__NON_OBJECT__")) {
  process.stdout.write(
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      structured_output: "not-an-object",
    }) + "\n"
  );
  process.exit(0);
}

if (prompt.includes("__SLOW__")) {
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}

if (prompt.includes("__LARGE__")) {
  process.stdout.write("x".repeat(4096));
  process.exit(0);
}

let structured = { verdict: "mixed", summary: "Fixture result", findings: [], confidence: 80 };
const schema = args.includes("--json-schema") ? JSON.parse(args[args.indexOf("--json-schema") + 1]) : null;
if (schema?.properties?.answer) structured = { answer: "Fixture answer", evidence: [], limitations: [] };
if (schema?.properties?.status) {
  if (prompt.includes("__WRITE_FIXTURE__")) await writeFile("fixture-output.txt", "written by fake Claude\n");
  structured = { status: "done", summary: "Fixture implementation", files: prompt.includes("__WRITE_FIXTURE__") ? ["fixture-output.txt"] : [], tasks: [], tests: [{ command: "npm test", status: "not_run", evidence: "Codex executes verification." }], openQuestions: [], risks: [] };
}
if (schema?.properties?.results || schema?.properties?.scores) {
  const ids = [...prompt.matchAll(/"id"\s*:\s*"([^"\\]+)"/g)].map(match => match[1]);
  structured = schema.properties.results ? { results: ids.map(id => ({ id, status: "confirmed", evidence: "Fixture", confidence: 80 })) } : { scores: ids.map(id => ({ id, score: 80, evidence: "Fixture" })) };
}
if (prompt.includes("__BAD_SCHEMA__")) structured = { confidence: 999 };
if (args[args.indexOf("--output-format") + 1] === "stream-json") process.stdout.write(JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-5-5" }) + "\n");
process.stdout.write(
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 25,
    duration_api_ms: 10,
    num_turns: 1,
    total_cost_usd: 0,
    session_id: args.includes("--resume") ? args[args.indexOf("--resume") + 1] : args.includes("--session-id") ? args[args.indexOf("--session-id") + 1] : randomUUID(),
    result: "Fixture text answer",
    modelUsage: { "claude-opus-5-5": { inputTokens: 10, outputTokens: 20 } },
    usage: { input_tokens: 10, output_tokens: 20 },
    permission_denials: [],
    ...(schema ? { structured_output: structured } : {}),
  }) + "\n"
);
