import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const assets = [];
async function walk(dir) {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const name = dir + "/" + file.name;
    if (file.isDirectory()) await walk(name);
    else if (/\.(js|css|woff2?)$/.test(name))
      assets.push("/" + name.replace("dist/client/", ""));
  }
}
await walk("dist/client/_next/static");
await writeFile("dist/client/precache.json", JSON.stringify(assets));
const source = await readFile("public/sw.js", "utf8");
const hash = createHash("sha256")
  .update(JSON.stringify(assets))
  .update(await readFile("public/data/grammar.json"))
  .digest("hex")
  .slice(0, 12);
await writeFile(
  "dist/client/sw.js",
  source.replace("kotoba-shell-v1", "kotoba-shell-" + hash),
);
console.log(`Prepared offline cache: ${assets.length} immutable assets.`);
