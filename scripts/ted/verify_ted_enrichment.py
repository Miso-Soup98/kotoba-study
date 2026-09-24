"""Independent conservation/reference audit of generated TED reading assets."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

BASE = Path(__file__).resolve().parents[2] / "private-content" / "ted"


def verify(source_dir: Path, output_dir: Path, allow_subset: bool = False):
    sources = {p.name: p for p in source_dir.glob("ted-*.json")}
    outputs = {p.name: p for p in output_dir.glob("ted-*.json")}
    if allow_subset:
        assert set(outputs).issubset(sources), "Output without corresponding source"
    else:
        assert sources.keys() == outputs.keys(), "Article file sets differ"
    counts = Counter()
    identities = set()
    for name, output_path in sorted(outputs.items()):
        source = json.loads(sources[name].read_bytes())
        target = json.loads(output_path.read_bytes())
        assert source["id"] == target["id"], name
        assert target["id"] not in identities, "Duplicate article ID"
        identities.add(target["id"])
        for key, value in source.items():
            if key not in {"paragraphs", "warnings"}:
                assert target[key] == value, f"Source field changed: {name}:{key}"
        assert all(w in target.get("warnings", []) for w in source.get("warnings", [])), name
        assert len(source["paragraphs"]) == len(target["paragraphs"]), name
        for original, paragraph in zip(source["paragraphs"], target["paragraphs"], strict=True):
            assert all(paragraph[k] == v for k, v in original.items()), f"Paragraph source changed: {name}:{original['id']}"
            assert "".join(t["surface"] for t in paragraph["tokens"]) == original["japanese"], f"Token roundtrip: {name}:{original['id']}"
            for token in paragraph["tokens"]:
                assert all(isinstance(token.get(k), str) for k in ("surface", "lemma", "reading", "pos")), name
                if "dictionaryId" in token:
                    assert token["dictionaryId"] in target["dictionary"], f"Dangling dictionary reference: {name}"
                    counts["dictionaryReferences"] += 1
                counts["tokens"] += 1
            counts["paragraphs"] += 1
        for key, entry in target["dictionary"].items():
            assert entry["examples"] == [], f"Imported dictionary quotation: {name}:{key}"
            assert isinstance(entry["meaning"], str) and entry["meaning"].strip(), name
            assert all(isinstance(entry[k], str) for k in ("term", "reading", "usage", "source")), name
            if key.startswith("kaikki-"):
                assert entry["page"] == 0 and "CC BY-SA 4.0" in entry["source"] and "zh.wiktionary.org" in entry["source"], name
            elif key.startswith("pdf-"):
                compatible = [g for g in source.get("glossary", []) if g.get("term") == entry["term"] and not g.get("uncertainTerm") and g.get("meaning") and g["meaning"] in entry["meaning"]]
                assert compatible, f"Uncertain or unsupported PDF association: {name}:{key}"
            else:
                raise AssertionError(f"Unexpected dictionary source: {key}")
            counts["dictionaryEntries"] += 1
        counts["articles"] += 1
        counts["bytes"] += output_path.stat().st_size
    report = json.loads((output_dir / "build-report.json").read_bytes())
    assert report["totals"]["articles"] == counts["articles"], "Build report article count differs"
    assert report["totals"]["tokens"] == counts["tokens"], "Build report token count differs"
    for row in report["articles"]:
        source_path = source_dir / (row["id"] + ".json")
        assert hashlib.sha256(source_path.read_bytes()).hexdigest() == row["sourceSha256"], "Source changed during build"
    assert (output_dir / "THIRD_PARTY_NOTICES.md").exists(), "Missing notices"
    assert (output_dir / "licenses" / "CC-BY-SA-4.0.txt").exists(), "Missing dictionary license"
    return {"passed": True, "checks": ["Source field conservation", "Complete unique article IDs", "Exact token roundtrip", "No dangling dictionary references", "No uncertain PDF glossary override", "No dictionary quotation examples", "Dictionary attribution", "Source hashes and report totals", "License files"], **counts}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=BASE / "export")
    parser.add_argument("--output", type=Path, default=BASE / "enriched")
    parser.add_argument("--allow-subset", action="store_true")
    args = parser.parse_args()
    result = verify(args.input, args.output, args.allow_subset)
    (args.output / "verification-report.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
