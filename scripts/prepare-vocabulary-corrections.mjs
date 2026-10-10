// Reproduce saved-word migrations from immutable published catalogs, offline.
import { readFile, writeFile } from "node:fs/promises";
import { VOCABULARY_VERSION } from "../lib/vocabulary/schema.ts";
const sourceVersions = ["v06-20261010-r1", "v06-20261010-r2"];
const read = async path => JSON.parse(await readFile(path, "utf8"));
const root = version => `public/data/vocabulary/${version}/`;
const catalog = await read(root(VOCABULARY_VERSION) + "index.json");
const words = {};
for (const shard of new Set(catalog.words.map(word => word.shard))) {
  const current = new Map((await read(root(VOCABULARY_VERSION) + shard)).map(word => [word.id, word]));
  for (const sourceVersion of sourceVersions) {
    for (const before of await read(root(sourceVersion) + shard)) {
      const after = current.get(before.id);
      if (!after || before.level !== after.level) throw Error(`Missing or changed identity: ${before.id}`);
      const set = Object.fromEntries(Object.entries(after).filter(([key, value]) =>
        key !== "version" && JSON.stringify(value) !== JSON.stringify(before[key])));
      if (Object.keys(set).length) (words[before.id] ??= []).push({sourceVersion, text: before.text, reading: before.reading, set});
    }
  }
}
await writeFile("lib/vocabulary/saved-word-corrections.json", JSON.stringify({version: VOCABULARY_VERSION, sourceVersions, words}) + "\n");
console.log(JSON.stringify({words: Object.keys(words).length, migrations: Object.values(words).reduce((n, rows) => n + rows.length, 0)}));
