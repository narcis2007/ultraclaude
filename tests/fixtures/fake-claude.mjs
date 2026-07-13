#!/usr/bin/env node

import process from "node:process";

const args = process.argv.slice(2);

if (args.includes("--version")) {
  process.stdout.write("2.1.207 (Fake Claude Code)\n");
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
  "--json-schema",
  "--append-system-prompt",
  "--model",
  "--effort",
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

process.stdout.write(
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 25,
    duration_api_ms: 10,
    num_turns: 1,
    total_cost_usd: 0,
    session_id: "fixture-session-1",
    structured_output: {
      verdict: "mixed",
      summary: "Fixture result",
      findings: [],
      confidence: 80,
    },
  }) + "\n"
);
