"""Apply two narrowly reviewed source corrections; keeps IDs and levels."""
import json
from build_vocabulary import HERE, LEVELS, dump, digest

def main():
    corrections = {
        "lex:openjlpt:b48d0c99d4": {
            "reason": "The N5 headword's two sentences explicitly mean soap. Waller/OpenJLPT incorrectly attach the homophone 節倹 (thrift). Correct the dictionary identity and meaning; preserve the soap sentences. N2 石鹸 is another spelling of this lexeme.",
            "evidence": ["https://tatoeba.org/sentences/show/214032", "https://tatoeba.org/sentences/show/10899704", "https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1382590"],
            "set": {"meaningEn": ["soap"], "meaningZh": "肥皂", "chineseSenses": ["肥皂"], "pos": ["n"], "jmdictId": 1382590, "chineseStatus": "dictionary-candidate", "chineseSource": "kaikki"},
            "duplicateOf": "lex:openjlpt:018b71a3e2",
            "resolved": True,
        },
        "lex:openjlpt:1fb9d39cd6": {
            "reason": "The matched JMdict 1106010 is the abbreviation of building, whereas the first Kaikki candidate is the separate homophone from bill. Use the intended building sense and remove the mixed English gloss.",
            "evidence": ["https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1106010", "https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07"],
            "set": {"meaningEn": ["multi-floor building", "multi-storey building"], "meaningZh": "楼房；大楼", "chineseSenses": ["楼房；大楼"], "chineseStatus": "machine-assisted", "chineseSource": "tomoshi"},
            "resolved": True,
        },
    }
    manifest = json.loads((HERE / "draft/manifest.json").read_text(encoding="utf-8"))
    records = []
    for level in LEVELS:
        path = HERE / f"draft/{level.lower()}.json"
        entries = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for entry in entries:
            if entry["id"] not in corrections:
                continue
            correction = corrections[entry["id"]]
            original = {key: entry.get(key) for key in correction["set"]}
            original.update({"text": entry["text"], "reading": entry["reading"], "level": entry["level"], "examples": entry["examples"]})
            records.append({"id": entry["id"], "original": original, **correction})
            entry.update(correction["set"])
            entry.pop("chineseSenseIndices", None)
            entry["sourceUrls"] = list(dict.fromkeys(entry["sourceUrls"] + correction["evidence"]))
            if entry["id"] == "lex:openjlpt:b48d0c99d4":
                entry["sourceUrls"].append("https://zh.wiktionary.org/wiki/%E7%9F%B3%E9%B9%B8")
            entry["contentCorrection"] = "v06-initial-source-corrections"
            changed = True
        if changed:
            dump(path, entries)
            info = next(item for item in manifest["files"] if item["level"] == level)
            info.update({"bytes": path.stat().st_size, "sha256": digest(path), "kaikkiCount": sum(e.get("chineseSource") == "kaikki" for e in entries), "tomoshiCount": sum(e.get("chineseSource") == "tomoshi" for e in entries)})
    # Never overwrite the original-before-correction evidence on a second run.
    evidence = HERE / "source-corrections.json"
    if not evidence.exists():
        dump(evidence, records)
    dump(HERE / "draft/manifest.json", manifest)
    print("Applied", len(records), "source corrections; missing-stable.json unchanged")

if __name__ == "__main__":
    main()
