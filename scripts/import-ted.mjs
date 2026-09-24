/** Private content importer. Secrets are accepted only on hidden stdin, never in arguments/files. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const at = arg.indexOf("=");
    if (at < 2) throw Error("Use --key=value options");
    return [arg.slice(2, at), arg.slice(at + 1)];
  }),
);
const origin = new URL(options.origin || "http://localhost:5173");
if (
  origin.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(origin.hostname)
)
  throw Error("Use HTTPS for remote import");
const root = resolve(options.root || ".."),
  inventory = JSON.parse(
    await readFile(
      resolve(options.inventory || "../tmp/ted-audit/audio-inventory.json"),
      "utf8",
    ),
  );
const articles = resolve(options.articles || "../tmp/ted-audit/enriched"),
  mode = options.mode || "all",
  limit = Number(options.limit || 0);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdin.resume();
console.log("Ready for importer credentials on hidden stdin.");
let input = "";
const credentials = await new Promise((resolve, reject) =>
  process.stdin.on("data", (chunk) => {
    input += chunk;
    const end = input.search(/[\r\n]/);
    if (end >= 0) {
      try {
        resolve(JSON.parse(input.slice(0, end)));
      } catch {
        reject(Error("Invalid credential input"));
      }
    }
  }),
);
process.stdin.pause();
const headers = {
  Authorization: `Bearer ${credentials.secret}`,
  ...(credentials.bypass
    ? { "OAI-Sites-Authorization": `Bearer ${credentials.bypass}` }
    : {}),
};
const report = {
  started: new Date().toISOString(),
  origin: origin.origin,
  mode,
  success: [],
  skipped: [],
  failed: [],
};
const out = resolve(options.report || ".sites-runtime/ted-import-report.json");
await mkdir(resolve(out, ".."), { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function sourcePath(name) {
  const path = resolve(root, name),
    rel = relative(root, path);
  if (rel.startsWith("..") || isAbsolute(rel))
    throw Error("Source file outside selected content root");
  return path;
}
async function request(path, options = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(new URL(path, origin), {
        ...options,
        headers: { ...headers, ...options.headers },
        redirect: "error",
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok) {
        const status = response.status;
        if (status < 500 && status !== 429)
          throw Object.assign(Error(`HTTP ${status}`), { fatal: true });
        throw Error(`HTTP ${status}`);
      }
      return await response.json();
    } catch (error) {
      if (error.fatal || attempt === 2) throw error;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}
const items = limit ? inventory.items.slice(0, limit) : inventory.items;
for (const [index, item] of items.entries()) {
  try {
    const remote = await request(`/api/ted/import?id=${item.id}`);
    for (const kind of mode === "media"
      ? ["audio", "pdf"]
      : mode === "articles"
        ? ["article"]
        : ["article", "audio", "pdf"]) {
      let bytes, mime;
      if (kind === "article") {
        const article = JSON.parse(
          await readFile(resolve(articles, item.id + ".json"), "utf8"),
        );
        article.durationSeconds = item.durationSeconds;
        article.warnings = [
          ...new Set([
            ...(article.warnings || []),
            ...(item.warnings || []),
            ...(item.audioDuplicateIds?.length
              ? [
                  `音频与 ${item.audioDuplicateIds.join("、")} 相同，已保留原资料，需核对是否配错。`,
                ]
              : []),
          ]),
        ];
        bytes = Buffer.from(JSON.stringify(article));
        mime = "application/json";
      } else {
        bytes = await readFile(
          sourcePath(kind === "audio" ? item.sourceAudio : item.sourcePdf),
        );
        mime = kind === "audio" ? "audio/mpeg" : "application/pdf";
      }
      const sha256 = hash(bytes);
      if (
        remote.files?.[kind]?.sha256 === sha256 &&
        remote.files[kind].size === bytes.length
      ) {
        report.skipped.push({ id: item.id, kind });
        continue;
      }
      const result = await request(
        `/api/ted/import?id=${item.id}&kind=${kind}`,
        {
          method: "PUT",
          headers: { "Content-Type": mime, "X-Content-Sha256": sha256 },
          body: bytes,
        },
      );
      if (result.sha256 !== sha256 || result.size !== bytes.length)
        throw Error("Import checksum mismatch");
      report.success.push({ id: item.id, kind, sha256, size: bytes.length });
    }
    console.log(`${index + 1}/${items.length} ${item.id}: verified`);
  } catch (error) {
    report.failed.push({ id: item.id, error: error.message });
    console.log(
      `${index + 1}/${items.length} ${item.id}: failed (${error.message})`,
    );
    if (/HTTP (401|403)/.test(error.message)) break;
  }
  await writeFile(out, JSON.stringify(report, null, 2));
}
report.finished = new Date().toISOString();
await writeFile(out, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    success: report.success.length,
    skipped: report.skipped.length,
    failed: report.failed.length,
  }),
);
if (report.failed.length) process.exitCode = 1;
