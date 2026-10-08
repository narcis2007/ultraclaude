import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--descendant")) {
  await new Promise(resolve => setTimeout(resolve, 10000));
} else {
  // Wait until the relay has assigned this process to its owned Windows job.
  for await (const chunk of process.stdin) { /* task bytes intentionally ignored */ }
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--descendant"], { stdio: ["ignore", "inherit", "inherit"] });
  process.stdout.write(JSON.stringify({ type: "descendant", pid: child.pid }) + "\n");
  if (process.argv.includes("--exit-root")) { child.unref(); process.exit(0); }
  await new Promise(resolve => setTimeout(resolve, 10000));
}
