"""Add Chinese only through exact JMdict IDs and compatible form/readings.

Queries the local read-only SQLite database one entry at a time with a 2 MiB
SQLite cache. No example translations or other proprietary layers are copied.
"""
from collections import Counter
import json
from pathlib import Path
import re
import sqlite3
from build_vocabulary import HERE, LEVELS, dump, digest, load_helpers

STOP = {"to", "a", "an", "the", "of", "or", "and", "be", "in", "for", "with", "as", "on", "at", "by", "one", "ones", "s", "something", "someone", "etc"}

def normalized(value):
    return re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", "", value).strip().lower())

def sense_score(glosses, targets):
    score = 0.0
    for gloss in glosses:
        for target in targets:
            a, b = normalized(gloss), normalized(target)
            if a == b:
                score = max(score, 10.0)
            aa, bb = set(re.findall(r"[a-z]+", a)) - STOP, set(re.findall(r"[a-z]+", b)) - STOP
            if aa and bb:
                score = max(score, len(aa & bb) / len(aa | bb))
    return score

def supplement(entry, connection, hira):
    ident = entry.get("jmdictId")
    if not ident:
        return "no-jmdict-id"
    row = connection.execute("SELECT e.data, z.data FROM entries e JOIN zh_defs z ON z.entry_id=e.id WHERE e.id=? AND z.locale='zh-CN'", (str(ident),)).fetchone()
    if not row:
        return "no-id-row"
    source, chinese = (json.loads(value) for value in row)
    written = {form["text"] for form in source["kanji"]} | {form["text"] for form in source["kana"]}
    if entry["text"] not in written:
        return "id-form-mismatch"
    reading = hira(entry["reading"])
    reading_rows = [form for form in source["kana"] if hira(form["text"]) == reading]
    if not reading_rows or not any(not form.get("restricted_to") or entry["text"] in form["restricted_to"] for form in reading_rows):
        return "id-reading-mismatch"
    candidates = []
    for index, sense in enumerate(source["senses"]):
        if any(any(label in str(tag).lower() for label in ["archai", "obsolete", "historical"]) for tag in sense.get("misc", [])):
            continue
        translated = chinese.get("senses", {}).get(str(index), {})
        meanings = [item["text"].strip() for item in translated.get("glosses", []) if isinstance(item.get("text"), str) and item["text"].strip() and len(item["text"].strip()) <= 220]
        if not meanings:
            continue
        score = sense_score([g["text"] for g in sense["glosses"] if g.get("lang") == "eng"], entry["meaningEn"])
        if score > 0:
            candidates.append((score, index, "；".join(meanings)))
    if not candidates:
        return "no-english-sense-overlap"
    candidates.sort(key=lambda item: (-item[0], item[1]))
    # Retain separately at most three meanings sharing the source entry's
    # target English sense; this is still marked machine-assisted/unreviewed.
    selected = candidates[:3]
    entry.update({"meaningZh": selected[0][2], "chineseSenses": list(dict.fromkeys(item[2] for item in selected)), "chineseStatus": "machine-assisted", "chineseSource": "tomoshi", "chineseSenseIndices": [item[1] for item in selected]})
    entry["sourceUrls"].append("https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07")
    return "supplemented"

def main():
    source = json.loads((HERE / "tomoshi/source.json").read_text(encoding="utf-8"))
    database = HERE / "tomoshi/tomoshi-dict-open.db"
    if digest(database) != source["databaseSha256"]:
        raise ValueError("Tomoshi database checksum mismatch")
    connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True)
    connection.execute("PRAGMA cache_size=-2048")
    licenses = connection.execute("SELECT table_name, license, attribution FROM table_licenses WHERE table_name IN ('entries','zh_defs')").fetchall()
    if len(licenses) != 2 or any(row[1] != "CC-BY-SA-4.0" for row in licenses):
        raise ValueError("Expected licensed dictionary tables missing")
    hira = load_helpers()["hira"]
    counts = Counter()
    levels, missing, samples = [], [], []
    sample_terms = {"会う", "青", "青い", "上手", "生", "行く", "人気", "一日", "明日", "大人", "食べる", "勉強", "遂げる", "健やか", "遂行", "する", "トランプ", "コンセント", "マンション", "ナイーブ", "クレーム"}
    for level in LEVELS:
        path = HERE / f"draft/{level.lower()}.json"
        entries = json.loads(path.read_text(encoding="utf-8"))
        for entry in entries:
            if not entry.get("meaningZh"):
                reason = supplement(entry, connection, hira)
                counts[reason] += 1
                if reason != "supplemented":
                    missing.append({"id": entry["id"], "text": entry["text"], "reading": entry["reading"], "level": level, "jmdictId": entry.get("jmdictId"), "meaningEn": entry["meaningEn"], "reason": reason})
            if entry["text"] in sample_terms:
                samples.append(entry)
        dump(path, entries)
        levels.append({"level": level, "file": path.name, "count": len(entries), "chineseCount": sum(bool(e.get("meaningZh")) for e in entries), "kaikkiCount": sum(e.get("chineseSource") == "kaikki" for e in entries), "tomoshiCount": sum(e.get("chineseSource") == "tomoshi" for e in entries), "bytes": path.stat().st_size, "sha256": digest(path)})
    manifest = json.loads((HERE / "draft/manifest.json").read_text(encoding="utf-8"))
    manifest["files"] = levels
    manifest["tomoshiSource"] = source
    manifest["tomoshiTableLicenses"] = [{"table": name, "license": license, "attribution": attribution} for name, license, attribution in licenses]
    manifest["limitations"].extend(["Tomoshi Chinese glosses are LLM-assisted translations and are not fully human-reviewed", "Tomoshi matching uses exact JMdict ID, compatible surface/reading, and English sense overlap; matched glosses may still need correction", "Chinese output contains both Simplified and Traditional source text; no silent Chinese-script conversion"])
    dump(HERE / "draft/manifest.json", manifest)
    report = {"total": sum(x["count"] for x in levels), "chineseCount": sum(x["chineseCount"] for x in levels), "kaikkiCount": sum(x["kaikkiCount"] for x in levels), "tomoshiCount": sum(x["tomoshiCount"] for x in levels), "missingCount": len(missing), "byLevel": levels, "tomoshiMatchReasons": dict(counts)}
    dump(HERE / "final-coverage-report.json", report)
    dump(HERE / "missing-chinese-final.json", missing)
    dump(HERE / "samples.json", samples)
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
