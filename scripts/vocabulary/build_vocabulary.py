"""Pinned open vocabulary draft, with bounded streaming Chinese dictionary lookup.

Only writes beneath this script's directory. Kaikki matching requires exact
headword plus an explicit compatible reading and POS; unknowns remain unknown.
"""
from __future__ import annotations
import ast
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
import urllib.request
from urllib.parse import quote

APP = Path(__file__).resolve().parents[2]
ROOT = APP.parent
HERE = Path(os.environ.get("KOTOBA_VOCAB_WORK", APP / "work/vocabulary")).resolve()
HERE.mkdir(parents=True, exist_ok=True)
COMMIT = "0d1d3410bec90bd4098a7c72de820543cb4f707c"
SOURCE_BASE = f"https://raw.githubusercontent.com/evanclan/OpenJLPT/{COMMIT}/"
LEVELS = ["N5", "N4", "N3", "N2", "N1"]

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def fetch(relative):
    path = HERE / "upstream" / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        request = urllib.request.Request(SOURCE_BASE + relative, headers={"User-Agent": "KotobaStudy-vocabulary-data/0.6"})
        with urllib.request.urlopen(request, timeout=45) as response, path.open("wb") as target:
            for chunk in iter(lambda: response.read(256 * 1024), b""):
                target.write(chunk)
    return {"path": str(path.relative_to(HERE)), "url": SOURCE_BASE + relative, "sha256": digest(path), "bytes": path.stat().st_size}

def load_helpers():
    # Reuse previously tested parsing helpers without importing Sudachi or its
    # full dictionary. Only this explicit allow-list of pure helpers is loaded.
    source = APP / "scripts/ted/enrich_ted.py"
    module = ast.parse(source.read_text(encoding="utf-8"))
    allowed = {"LEGACY_POS", "TAGS_ZH", "hira", "unique", "clean_text", "kana_reading", "ruby_reading", "legacy_gloss", "compact_record"}
    nodes = []
    for node in module.body:
        if isinstance(node, ast.FunctionDef) and node.name in allowed:
            nodes.append(node)
        elif isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in allowed for t in node.targets):
            nodes.append(node)
        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute) and isinstance(node.value.func.value, ast.Name) and node.value.func.value.id == "LEGACY_POS":
            nodes.append(node)
    scope = {"re": re, "unicodedata": unicodedata}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), "exec"), scope)
    return scope

def pos_allowed(codes):
    result = set()
    for p in codes:
        if p.startswith("v"):
            result.add("verb")
        if p in {"n", "n-adv", "n-t", "n-pr", "n-pref", "n-suf", "vs", "vs-i"}:
            result.add("noun")
        if p.startswith("adj"):
            result.add("adj")
        if p in {"adv", "adv-to", "n-adv"}:
            result.add("adv")
        if p == "adj-pn":
            result.update({"adnominal", "det"})
        if p in {"pn", "pron", "conj", "int", "pref", "suf", "prt", "ctr", "num", "exp", "aux", "aux-v", "aux-adj"}:
            result.update({"pn": ["pron"], "pron": ["pron"], "conj": ["conj"], "int": ["intj"], "pref": ["prefix"], "suf": ["suffix"], "prt": ["particle"], "ctr": ["counter", "classifier"], "num": ["num", "numeral"], "exp": ["phrase", "intj"], "aux": ["aux"], "aux-v": ["verb", "aux"], "aux-adj": ["adj", "aux"]}[p])
    return result

def strict_record(raw, helper, rejects):
    if raw.get("lang_code") != "ja":
        rejects["non-japanese"] += 1
        return None
    if raw.get("pos") in {"character", "symbol", "punct", "romanization", "soft-redirect", "name", "proper-noun"}:
        rejects["non-vocabulary-pos"] += 1
        return None
    senses = []
    for sense in raw.get("senses", []):
        tags = set(sense.get("tags", []))
        if sense.get("form_of") or sense.get("alt_of") or tags.intersection({"form-of", "alt-of", "romanization", "obsolete", "archaic", "classical", "historical"}):
            rejects["form-alt-or-historical-sense"] += 1
            continue
        safe = dict(sense)
        safe["glosses"] = [g for g in sense.get("glosses", []) if isinstance(g, str) and not re.search(r"(?:的(?:活用|變位|变位|羅馬字|罗马字|拼寫|拼写|古典|已廢棄|已废弃)|(?:活用形|變位形式|变位形式)|請參閱|请参阅|[Ss]ee |[Ff]orm of|[Aa]lternative form|的表記)", g)]
        if safe["glosses"]:
            senses.append(safe)
        else:
            rejects["non-definition-gloss"] += 1
    if not senses:
        return None
    filtered = {**raw, "senses": senses}
    record = helper["compact_record"](filtered)
    if not record:
        return None
    if not record["readings"]:
        rejects["no-explicit-reading"] += 1
        return None
    return record

def main():
    sources = [fetch(p) for p in ["LICENSE", "NOTICE.md", "data/json/meta.json", "data/json/pos.json", *[f"data/json/vocab/{level.lower()}.json" for level in LEVELS]]]
    words = [entry for level in LEVELS for entry in json.loads((HERE / f"upstream/data/json/vocab/{level.lower()}.json").read_text(encoding="utf-8"))]
    wanted = {w["word"] for w in words}
    helper = load_helpers()
    records = defaultdict(list)
    raw_seen = Counter()
    rejects = Counter()
    duplicates = set()
    dict_dir = Path(os.environ.get("KOTOBA_DICTIONARIES", ROOT / "tmp/ted-audit/dictionaries"))
    source_manifest = json.loads((dict_dir / "download-manifest.json").read_text(encoding="utf-8"))
    for item in source_manifest:
        path = dict_dir / item["file"]
        if digest(path) != item["sha256"]:
            raise ValueError("Dictionary source checksum mismatch: " + path.name)
        with path.open(encoding="utf-8") as stream:
            for line in stream:
                raw = json.loads(line)
                word = raw.get("word")
                if word not in wanted:
                    continue
                raw_seen[word] += 1
                record = strict_record(raw, helper, rejects)
                if not record:
                    continue
                fingerprint = json.dumps(record, ensure_ascii=False, sort_keys=True)
                if fingerprint in duplicates:
                    continue
                duplicates.add(fingerprint)
                records[word].append(record)
    output = {level: [] for level in LEVELS}
    missing = []
    word_reasons = Counter()
    samples = []
    for word in words:
        candidates = records.get(word["word"], [])
        reading = helper["hira"](word["reading"])
        same_reading = [r for r in candidates if reading in r["readings"]]
        allowed = pos_allowed(word.get("pos", []))
        matched = [r for r in same_reading if r["pos"] in allowed or (r["pos"] == "unknown" and bool(set(r["posHints"]).intersection(allowed)))]
        expected_class = "suru" if any(p.startswith("vs") for p in word.get("pos", [])) else "godan" if any(p.startswith("v5") for p in word.get("pos", [])) else "ichidan" if any(p.startswith("v1") for p in word.get("pos", [])) else ""
        if expected_class:
            matched = [r for r in matched if r["verbClass"] in {"", expected_class}]
            exact_class = [r for r in matched if r["verbClass"] == expected_class]
            if exact_class:
                matched = exact_class
        ambiguous = len(matched) > 1
        if ambiguous:
            matched = []
        reason = "no-headword" if not raw_seen[word["word"]] else "no-safe-definition-with-reading" if not candidates else "reading-mismatch" if not same_reading else "ambiguous-dictionary-entry" if ambiguous else "pos-mismatch" if not matched else "matched"
        word_reasons[reason] += 1
        meanings = helper["unique"](sense["gloss"] for r in matched for sense in r["senses"] if sense["gloss"] and len(sense["gloss"]) <= 220)
        examples = [{"japanese": e["ja"], "english": e["en"], **({"furigana": e["furigana"]} if e.get("furigana") else {}), "tatoebaId": e["tatoeba_id"], "sourceUrl": f'https://tatoeba.org/sentences/show/{e["tatoeba_id"]}'} for e in word.get("examples", [])]
        entry = {"id": "lex:openjlpt:" + word["id"], "text": word["word"], "reading": word["reading"], "level": word["level"], "meaningEn": word["meanings"], "pos": word.get("pos", []), "examples": examples, "sourceUrls": [f'https://github.com/evanclan/OpenJLPT/blob/{COMMIT}/data/json/vocab/{word["level"].lower()}.json'], "chineseStatus": "missing", "reviewStatus": "unreviewed"}
        if word.get("jmdict_id"):
            entry["jmdictId"] = word["jmdict_id"]
        if meanings:
            # Reviewed selection within the same source senses. The first
            # Wiktionary sense of する is existential, but this JLPT entry's
            # English target is 'to do'; use the existing '做' sense first.
            if word["id"] == "c4cdc162d7" and "做" in meanings:
                meanings.remove("做")
                meanings.insert(0, "做")
            entry.update({"meaningZh": meanings[0], "chineseSenses": meanings[:5], "chineseStatus": "dictionary-candidate", "chineseSource": "kaikki"})
            entry["sourceUrls"].append("https://zh.wiktionary.org/wiki/" + quote(word["word"], safe=""))
        else:
            missing.append({"id": entry["id"], "text": entry["text"], "reading": entry["reading"], "level": entry["level"], "jmdictId": entry.get("jmdictId"), "reason": reason, "meaningEn": entry["meaningEn"]})
        output[word["level"]].append(entry)
        if entry["text"] in {"会う", "青", "青い", "上手", "生", "行く", "人気", "一日", "明日", "大人", "食べる", "勉強", "遂げる", "健やか", "遂行", "する", "トランプ", "コンセント", "マンション", "ナイーブ", "クレーム"}:
            samples.append(entry)
    files = []
    for level, entries in output.items():
        path = HERE / "draft" / f"{level.lower()}.json"
        dump(path, entries)
        files.append({"level": level, "file": path.name, "count": len(entries), "chineseCount": sum("meaningZh" in entry for entry in entries), "bytes": path.stat().st_size, "sha256": digest(path)})
    manifest = {"formatVersion": 1, "version": "vocabulary-2026-10-v06", "builtAt": datetime.now(timezone.utc).isoformat(), "license": "CC-BY-SA-4.0", "openjlptCommit": COMMIT, "total": len(words), "files": files, "sourceFiles": sources, "dictionarySources": source_manifest, "limitations": ["JLPT levels are unofficial community estimates, not official or exhaustive test lists", "Chinese candidate definitions are exact form + reading + POS matches, not manually sense-reviewed", "Examples are Japanese with English translations, never labelled Chinese", "No dictionary quotation examples, audio files or accent data were imported"]}
    manifest["posLabelsEn"] = json.loads((HERE / "upstream/data/json/pos.json").read_text(encoding="utf-8"))
    dump(HERE / "draft/manifest.json", manifest)
    report = {"total": len(words), "chineseCount": sum(item["chineseCount"] for item in files), "byLevel": files, "wordMatchReasons": dict(word_reasons), "recordRejectionReasons": dict(rejects), "safeCandidateHeadwords": len(records), "sampleCount": len(samples)}
    dump(HERE / "coverage-report.json", report)
    dump(HERE / "missing-chinese.json", missing)
    dump(HERE / "samples.json", samples)
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
