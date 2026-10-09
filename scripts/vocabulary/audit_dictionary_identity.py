"""Conservative content audit; writes review/quarantine lists, never edits draft.

A passed automatic check is NOT a claim of full semantic or pronunciation
review. Failed overlap includes harmless paraphrases and must be reviewed.
"""
from collections import Counter, defaultdict
import json
import re
import sqlite3
from build_vocabulary import HERE, LEVELS, dump, load_helpers
from supplement_tomoshi import sense_score

def main():
    helper = load_helpers()
    hira = helper["hira"]
    words = [entry for level in LEVELS for entry in json.loads((HERE / f"draft/{level.lower()}.json").read_text(encoding="utf-8"))]
    database = HERE / "tomoshi/tomoshi-dict-open.db"
    connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True)
    connection.execute("PRAGMA cache_size=-2048")
    surface_readings = defaultdict(set)
    for word in words:
        surface_readings[word["text"]].add(hira(word["reading"]))
    kana_heads = {word["text"] for word in words if re.fullmatch(r"[ぁ-ゖァ-ヺー]+", word["text"])}
    kana_entries = defaultdict(set)
    # forms has no index; read its small columns once, never scan per word.
    for written, ident, common in connection.execute("SELECT text, entry_id, is_common FROM forms"):
        if common and written in kana_heads:
            kana_entries[written].add(int(ident))
    quarantine, example_review, known = [], [], []
    counts = Counter()
    for word in words:
        reasons = []
        ident = word.get("jmdictId")
        row = connection.execute("SELECT data FROM entries WHERE id=?", (str(ident),)).fetchone() if ident else None
        source = json.loads(row[0]) if row else None
        if source is None:
            reasons.append("no-reference-entry")
        else:
            written = {f["text"] for kind in ["kanji", "kana"] for f in source[kind]}
            if word["text"] not in written:
                reasons.append("surface-needs-confirmation")
            kana = [f for f in source["kana"] if hira(f["text"]) == hira(word["reading"])]
            if not kana or not any(not f.get("restricted_to") or word["text"] in f["restricted_to"] for f in kana):
                reasons.append("reading-needs-confirmation")
            english = [g["text"] for sense in source["senses"] for g in sense["glosses"] if g.get("lang") == "eng"]
            if sense_score(english, word["meaningEn"]) == 0:
                reasons.append("english-meaning-no-reference-overlap")
            if any(any(flag in str(tag).lower() for flag in ["out-dated", "outdated", "obsolete", "rare", "irregular"]) for f in kana for tag in f.get("info", [])):
                reasons.append("uncommon-or-irregular-reading")
            if word.get("pos") == ["adj-nari", "n"] or "adj-nari" in word.get("pos", []):
                reasons.append("archaic-reading-needs-context")
        ex_reasons = []
        if len(surface_readings[word["text"]]) > 1:
            ex_reasons.append("same-surface-multiple-course-readings")
        if any(other != ident for other in kana_entries.get(word["text"], set())):
            ex_reasons.append("kana-headword-has-other-common-homophone")
        for example in word["examples"]:
            readings = re.findall(r"\{" + re.escape(word["text"]) + r"\|([^}]+)\}", example.get("furigana", ""))
            if any(hira(r) != hira(word["reading"]) for r in readings):
                ex_reasons.append("example-furigana-contradicts-reading")
        # Known source inconsistency: the basic N5 word's examples both mean
        # soap, while its raw JMdict link incorrectly selects thrift.
        if word["id"] == "lex:openjlpt:b48d0c99d4" and word.get("jmdictId") == 1386220:
            reasons.append("known-soap-thrift-homophone-mismatch")
        if reasons:
            counts.update(reasons)
            quarantine.append({"id": word["id"], "text": word["text"], "reading": word["reading"], "level": word["level"], "reasons": reasons, "meaningEn": word["meaningEn"], "meaningZh": word.get("meaningZh"), "jmdictId": ident, "referenceEnglish": english[:16] if source else []})
        if ex_reasons and word["examples"]:
            example_review.append({"id": word["id"], "text": word["text"], "reading": word["reading"], "level": word["level"], "reasons": sorted(set(ex_reasons)), "tatoebaIds": [e["tatoebaId"] for e in word["examples"]]})
        if word["text"] in {"せっけん", "陸", "能", "一定", "ビル"}:
            known.append({"word": word, "reference": source})
    dump(HERE / "quarantine-candidates.json", quarantine)
    dump(HERE / "example-review-candidates.json", example_review)
    dump(HERE / "known-source-inconsistencies.json", known)
    report = {"words": len(words), "enrollmentHoldCandidates": len(quarantine), "enrollmentHoldReasons": dict(counts), "wordsWithExampleHoldCandidates": len(example_review), "limitations": ["This is lexical consistency screening, not full semantic verification", "No-overlap may reflect harmless synonyms; holds are conservative", "Waller snapshots contain the same known input mistakes and are not a safe automatic repair source", "A reference ID shared by two spellings may produce duplicate learning cards unless caller deduplicates"]}
    dump(HERE / "identity-audit-report.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
