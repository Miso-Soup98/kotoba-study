import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { runBounded } from "./run-bounded.mjs";

if (await runBounded({ mode: "dev" })) process.exit(process.exitCode ?? 0);
await import("./sites-env.mjs");
const cli = new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url);
const child = spawn(process.execPath, [fileURLToPath(cli), "dev", "--config", "dist/server/wrangler.json",
  "--local", "--persist-to", ".wrangler/state", "--ip", "127.0.0.1", "--inspector-port", "0",
  ...process.argv.slice(2)], { stdio: "inherit", windowsHide: true });
process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));
child.once("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.once("close", (code) => { process.exitCode = code ?? 1; });
