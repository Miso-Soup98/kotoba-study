import { spawn } from "node:child_process";
import { runBounded } from "./run-bounded.mjs";

const [executable, ...args] = process.argv.slice(2);
if (!executable) throw new Error("Pass an executable and its arguments (on Windows, use an explicit .exe path).");
if (await runBounded({ executable, args, mode: "build" })) process.exit(process.exitCode ?? 0);
const child = spawn(executable, args, { stdio: "inherit", windowsHide: true });
child.once("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.once("close", (code) => { process.exitCode = code ?? 1; });
