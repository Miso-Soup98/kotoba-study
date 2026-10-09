import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createZstdDecompress } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.join(path.resolve(process.env.KOTOBA_VOCAB_WORK || 'work/vocabulary'), 'tomoshi');
await mkdir(directory, { recursive: true });
const tag = 'v2026-10-07';
const url = `https://github.com/tomoshi-app/tomoshi-dict-data/releases/download/${tag}/tomoshi-dict-open.db.zst`;
const compressed = path.join(directory, 'tomoshi-dict-open.db.zst');
const database = path.join(directory, 'tomoshi-dict-open.db');
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
if (!existsSync(compressed)) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(compressed, { flags: 'wx' }));
}
const expectedCompressed = 'daa44935c654a4face33f873250484cca16a1bf846d700a8d7611b113953227f';
if (await hash(compressed) !== expectedCompressed) throw new Error('Compressed checksum mismatch');
if (!existsSync(database)) await pipeline(createReadStream(compressed), createZstdDecompress(), createWriteStream(database, { flags: 'wx' }));
const expectedDatabase = '7c3479bcde859772403045da21cf975decd92e492142b50453354a0ad35ea7ed';
if (await hash(database) !== expectedDatabase) throw new Error('Database checksum mismatch');
const commitResponse = await fetch(`https://api.github.com/repos/tomoshi-app/tomoshi-dict-data/commits/${tag}`, { headers: { Accept: 'application/vnd.github+json' } });
if (!commitResponse.ok) throw new Error('Could not pin source commit');
const commit = (await commitResponse.json()).sha;
for (const name of ['LICENSE.md', 'NOTICE.md', 'README.md']) {
  const response = await fetch(`https://raw.githubusercontent.com/tomoshi-app/tomoshi-dict-data/${commit}/${name}`);
  if (!response.ok) throw new Error(`Missing ${name}`);
  await writeFile(path.join(directory, name), await response.text(), 'utf8');
}
const manifest = { tag, commit, url, compressedSha256: expectedCompressed, databaseSha256: expectedDatabase, license: 'CC-BY-SA-4.0 (excluding unused kanji_strokes table)', chineseContent: 'LLM-assisted JMdict gloss translations; not fully human-reviewed', downloadedAt: new Date().toISOString() };
await writeFile(path.join(directory, 'source.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
