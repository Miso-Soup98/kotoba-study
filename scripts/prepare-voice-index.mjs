import { readFile, writeFile } from "node:fs/promises";

// Keep generated media out of the HMR graph. Refresh this source snapshot once
// when starting preview/build, not after every synthesized clip.
const source = new URL("../public/audio/voices/manifest.json", import.meta.url);
const target = new URL("../lib/study/voice-manifest.json", import.meta.url);
const text = await readFile(source, "utf8");
const value = JSON.parse(text);
if (!Array.isArray(value.clips) || value.clips.length > 10000)
  throw Error("Invalid voice manifest.");
let existing = "";
try { existing = await readFile(target, "utf8"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
if (existing !== text) await writeFile(target, text);
