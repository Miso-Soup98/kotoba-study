// Offline publication step. No API keys, network, global installs, or speech generation.
// Input: reviewed draft directory produced by the documented vocabulary pipeline.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const version = "v06-20261010-r2", levels = ["N5", "N4", "N3", "N2", "N1"];
const input = process.argv[2];
if (!input) throw Error("Usage: node scripts/prepare-vocabulary.mjs <draft-directory> <manual-chinese.json> <quarantine.json> <example-review.json> <tatoeba-attribution.json> <source-corrections.json>");
if (process.argv.length !== 8) throw Error("Publication requires all six reviewed inputs; refusing an unreviewed catalog.");
const draft = resolve(input), output = resolve("public/data/vocabulary", version);
const manual = process.argv[3] ? JSON.parse(await readFile(resolve(process.argv[3]), "utf8")) : [];
const quarantine = process.argv[4] ? JSON.parse(await readFile(resolve(process.argv[4]), "utf8")) : [];
const exampleReview = process.argv[5] ? JSON.parse(await readFile(resolve(process.argv[5]), "utf8")) : [];
const hideExamples = new Set(exampleReview.map(row => typeof row === "string" ? row : row.id));
const attributed = process.argv[6] ? JSON.parse(await readFile(resolve(process.argv[6]), "utf8")) : [];
const attributions = new Map(attributed.map(row => [row.tatoebaId, row]));
const sourceCorrections = process.argv[7] ? JSON.parse(await readFile(resolve(process.argv[7]), "utf8")) : [];
const sourceResolved = new Set(sourceCorrections.filter(row => row.resolved).map(row => row.id));
const overrides = new Map(manual.map(row => [row.id, row]));
const blocked = new Map(quarantine.map(row => [typeof row === "string" ? row : row.id,
  typeof row === "string" ? "读音或义项有待核对。" : row.reason || "来源的词形、读音或英文义项未能可靠对应，暂缓背诵；这不表示已经确认原词有错。"]));
const catalog = { version, counts: {}, chineseCounts: {}, words: [] };
const report = { version, counts: {}, total: 0, chinese: 0, ready: 0, needsReview: 0, corrections: [], files: [] };
const isDefinition = value => !!value.trim() && !/Template:|模板[:：]|以下.{0,12}(?:尚未|未創建|未创建)|=+\s*(?:日语|日語|日本語)\s*=+|^【[^】]+】$|^\[[^\]]+\]$/i.test(value.trim());
await mkdir(output, { recursive: true });
for (const level of levels) {
  const data = JSON.parse(await readFile(join(draft, level.toLowerCase() + ".json"), "utf8"));
  const words = data.map(row => {
    const patch = overrides.get(row.id);
    const original = { text: row.text, reading: row.reading, meaningEn: row.meaningEn, pos: row.pos };
    const rawZh = patch?.meaningZh ?? row.meaningZh ?? "";
    const meanZh = isDefinition(rawZh) ? rawZh : "";
    const text = patch?.textCorrected || row.text, reading = patch?.readingCorrected || row.reading;
    const en = patch?.meaningEnCorrected || row.meaningEn;
    const pos = patch?.posCorrected || row.pos;
    const reason = patch?.blocked ? patch.reason : patch?.resolved || sourceResolved.has(row.id) ? undefined : blocked.get(row.id);
    if (patch) report.corrections.push({ id: row.id, original, ...patch });
    const word = {
      id: row.id, text, reading, meaning: meanZh || `英文：${en.join("; ")}`,
      source: row.id, original: `OpenJLPT ${row.level} · ${row.text}（${row.reading}）`, level, version,
      meaningZh: meanZh, meaningEn: en.slice(0, 20),
      chineseSenses: (patch?.chineseSenses ?? (patch?.meaningZh !== undefined ? (meanZh ? [meanZh] : []) : (row.chineseSenses || []))).filter(isDefinition).slice(0, 20),
      chineseStatus: patch?.meaningZh ? "machine-assisted" : row.chineseStatus,
      learningStatus: reason || patch?.blocked ? "needs-review" : "ready",
      contentNote: reason || patch?.reason || row.contentNote || "",
      pos: pos.slice(0, 20),
      sentences: patch?.removeExamples || reason || hideExamples.has(row.id) ? [] : (row.examples || []).flatMap(ex => {
        const pair = attributions.get(ex.tatoebaId);
        if (!pair || pair.japanese.text !== ex.japanese || pair.english.text !== ex.english) return [];
        return [{ japanese: ex.japanese, english: ex.english, sourceUrl: pair.japanese.sourceUrl,
          japaneseAuthor: pair.japanese.username, englishAuthor: pair.english.username,
          japaneseAuthorUrl: pair.japanese.authorUrl, englishAuthorUrl: pair.english.authorUrl,
          englishSourceUrl: pair.english.sourceUrl, licenseUrl: pair.japanese.licenseUrl }];
      }).slice(0, 2),
      sourceUrls: [...new Set([...row.sourceUrls, ...(patch?.referenceUrls || []), ...(patch?.referenceUrl ? [patch.referenceUrl] : [])])].slice(0, 8),
    };
    if (!meanZh) word.chineseStatus = "missing";
    return word;
  });
  catalog.counts[level] = words.length;
  catalog.chineseCounts[level] = words.filter(w => w.meaningZh).length;
  report.counts[level] = { total: words.length, chinese: catalog.chineseCounts[level], ready: words.filter(w => w.learningStatus === "ready").length };
  report.total += words.length; report.chinese += catalog.chineseCounts[level];
  report.ready += report.counts[level].ready;
  report.needsReview += words.length - report.counts[level].ready;
  for (let offset = 0; offset < words.length; offset += 100) {
    const name = `${level}-${String(offset / 100 + 1).padStart(3, "0")}.json`;
    const group = words.slice(offset, offset + 100), body = JSON.stringify(group);
    await writeFile(join(output, name), body + "\n");
    report.files.push({ name, count: group.length, bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex") });
    catalog.words.push(...group.map(({ id, text, reading, meaning, meaningEn, level, learningStatus }) => ({ id, text, reading, meaning, meaningEn, level, learningStatus, shard: name })));
  }
}
if (new Set(catalog.words.map(w => w.id)).size !== report.total) throw Error("Duplicate vocabulary IDs");
await writeFile(join(output, "index.json"), JSON.stringify(catalog) + "\n");
await writeFile(join(output, "build-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, corrections: report.corrections.length, files: report.files.length }, null, 2));
