"""Apply checked private TED overlays and rebuild tokens/dictionary offline.

Only articles named by the corrections are emitted. Source files are never
modified. Output remains private because it contains the original transcripts.
The script imports an existing enrich_ted.py and reads its local dictionaries;
it neither downloads dependencies nor makes network requests.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import re


HERE = Path(__file__).resolve().parent
BASE = HERE.parents[1] / "private-content" / "ted"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(path)


def checked_records(records):
    if not isinstance(records, list) or not records:
        raise ValueError("Expected a nonempty corrections array")
    ids = set()
    groups = defaultdict(list)
    for record in records:
        if record.get("confidence") != "checked":
            raise ValueError("Only explicitly checked corrections can be applied")
        if not isinstance(record.get("id"), str) or record["id"] in ids:
            raise ValueError("Missing or duplicate correction id")
        ids.add(record["id"])
        article_id = record.get("articleId", "")
        if not re.fullmatch(r"ted-(?:new|old)-\d{3}", article_id):
            raise ValueError("Invalid article id")
        if record.get("kind") not in {"paragraph", "glossary"}:
            raise ValueError("Unsupported correction kind")
        groups[article_id].append(record)
    return groups


def apply_article(raw, records):
    article = copy.deepcopy(raw)
    existing_ids = {r["id"] for r in article.get("corrections", [])}
    if any(r["id"] in existing_ids for r in records):
        raise ValueError("Input already includes one of these corrections; use the unchanged source")
    touched = set()
    # Append missing entries after indexed replacements, keeping original indexes
    # stable and making repeated builds against the source deterministic.
    ordered = sorted(records, key=lambda r: r.get("operation") == "insert-missing-glossary")
    for record in ordered:
        if record["kind"] == "paragraph":
            target_id = ("paragraph", record["paragraphId"])
            matches = [p for p in article["paragraphs"] if p["id"] == record["paragraphId"]]
            if len(matches) != 1:
                raise ValueError(f"Missing or ambiguous paragraph: {record['id']}")
            paragraph = matches[0]
            original = record.get("original", {})
            if any(paragraph.get(field) != original.get(field) for field in ("japanese", "chinese")):
                raise ValueError(f"Source paragraph changed since review: {record['id']}")
            for field in ("japanese", "chinese"):
                if field in record:
                    if not isinstance(record[field], str) or not record[field]:
                        raise ValueError("Replacement paragraph must be a nonempty string")
                    paragraph[field] = record[field]
            paragraph.setdefault("correctionIds", []).append(record["id"])
        elif record.get("operation") == "insert-missing-glossary":
            term = record.get("correctedTerm", record["term"])
            target_id = ("insert", term)
            if any(g.get("term") == term for g in article["glossary"]):
                raise ValueError(f"Missing-entry insertion would duplicate {record['id']}")
            entry = copy.deepcopy(record.get("original", {}))
            entry.update({"term": term, "reading": record.get("correctedReading", ""),
                          "meaning": record["correctedMeaning"], "usage": "", "examples": [],
                          "page": record.get("reference", {}).get("page", entry.get("page", 0)),
                          "reviewRequired": False, "correctionIds": [record["id"]],
                          "reviewStatus": "checked-correction"})
            article["glossary"].append(entry)
        else:
            index = record.get("glossaryIndex")
            if not isinstance(index, int) or not 0 <= index < len(raw["glossary"]):
                raise ValueError(f"Invalid glossary index: {record['id']}")
            target_id = ("glossary", index)
            entry = article["glossary"][index]
            if entry != record.get("original"):
                raise ValueError(f"Source glossary changed since review: {record['id']}")
            for corrected, field in (("correctedTerm", "term"), ("correctedReading", "reading"), ("correctedMeaning", "meaning")):
                if corrected in record:
                    entry[field] = record[corrected]
            entry["reviewRequired"] = False
            if "uncertainTerm" in entry:
                entry["uncertainTerm"] = False
            entry["reviewStatus"] = "checked-correction"
            entry.setdefault("correctionIds", []).append(record["id"])
        if target_id in touched:
            raise ValueError(f"Two corrections write the same target: {target_id}")
        touched.add(target_id)
    article.setdefault("corrections", []).extend(copy.deepcopy(records))
    article.setdefault("warnings", []).append(
        "本篇已应用可追溯语言订正；上方导入时警告保留为原始记录，具体已修正内容见订正记录。"
        "本次不代表全文事实核查、全部词注或自动读音均已审校。"
    )
    return article


def load_enricher(path):
    spec = importlib.util.spec_from_file_location("ted_offline_enricher", path)
    if spec is None or spec.loader is None:
        raise ValueError("Cannot import the offline enrichment script")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build(args):
    input_dir, output_dir = args.input.resolve(), args.output.resolve()
    if input_dir == output_dir or input_dir in output_dir.parents or output_dir in input_dir.parents:
        raise ValueError("Input and output must be separate, nonnested directories")
    groups = checked_records(read_json(args.corrections))
    # Validate every correction against its source before writing any outputs.
    sources, pending = {}, []
    for article_id, records in sorted(groups.items()):
        path = input_dir / (article_id + ".json")
        data = path.read_bytes()
        raw = json.loads(data)
        if raw.get("id") != article_id:
            raise ValueError(f"Source article id mismatch: {article_id}")
        sources[path] = data
        pending.append((raw, apply_article(raw, records), records, sha256(data)))
    module = load_enricher(args.enricher)

    class ReviewedEnricher(module.Enricher):
        def lookup(self, article, surface, lemma, reading, pos, counter_context=False):
            entry, kind = super().lookup(article, surface, lemma, reading, pos, counter_context)
            if entry and kind == "pdf":
                reviewed = [g for g in article["glossary"]
                            if g.get("term") == entry["term"] and g.get("correctionIds")]
                if reviewed:
                    entry["source"] = "本篇词注的已核对订正（原词注与依据见订正记录）"
                    entry["correctionIds"] = list(dict.fromkeys(i for g in reviewed for i in g["correctionIds"]))
            return entry, kind

    chinese = module.ChineseDictionary(args.dictionaries, allow_partial=False)
    enricher = ReviewedEnricher(chinese)
    staged, report_articles = [], []
    totals = Counter()
    for raw, article, records, source_hash in pending:
        result, stats = enricher.enrich(article)
        result["dictionaryBuild"]["glossaryPriority"] = "checked-corrections-then-source-pdf"
        result["correctionBuild"] = {
            "version": 1, "sourceSha256": source_hash,
            "appliedCorrectionIds": [r["id"] for r in records],
            "tokenRoundTripVerified": True, "networkRequests": False,
            "originalRecordsPreservedInCorrections": True,
            "contextualSenseDisambiguation": False,
        }
        if not set(raw).issubset(result):
            raise AssertionError("Original top-level fields were dropped")
        for before, after in zip(raw["paragraphs"], result["paragraphs"]):
            if not set(before).issubset(after) or before["id"] != after["id"]:
                raise AssertionError("Paragraph identity or original field was dropped")
            if "".join(t["surface"] for t in after["tokens"]) != after["japanese"]:
                raise AssertionError("Tokens do not reconstruct corrected Japanese")
            if any(t.get("dictionaryId") and t["dictionaryId"] not in result["dictionary"] for t in after["tokens"]):
                raise AssertionError("Dangling dictionary id")
        for before, after in zip(raw["glossary"], result["glossary"]):
            if not set(before).issubset(after):
                raise AssertionError("Original glossary field was dropped")
        totals.update(stats)
        staged.append((output_dir / (result["id"] + ".json"), result))
        report_articles.append({"id": result["id"], "corrections": len(records),
                                "sourceSha256": source_hash,
                                "originalGlossaryCount": len(raw["glossary"]),
                                "correctedGlossaryCount": len(result["glossary"]), **stats})
    if any(path.read_bytes() != original for path, original in sources.items()):
        raise AssertionError("Source files changed during the build")
    for path, result in staged:
        write_json(path, result)
    for item, (path, _) in zip(report_articles, staged):
        item["outputSha256"] = sha256(path.read_bytes())
    report = {
        "articles": report_articles, "totals": dict(totals),
        "corrections": sum(len(v) for v in groups.values()),
        "unchangedSourceFilesVerified": len(sources), "tokenRoundTripVerified": True,
        "dictionaryIndex": dict(chinese.stats), "dictionaryDownloadsComplete": chinese.complete,
        "limitations": ["Only the listed corrections were applied; remaining content is not claimed fully reviewed",
                        "Automatic readings and candidate dictionary senses are not contextually disambiguated",
                        "Audio was not listened to or aligned", "Private source transcripts must not be published on GitHub"],
    }
    write_json(output_dir / "private-correction-build-report.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=BASE / "enriched")
    parser.add_argument("--output", type=Path, default=BASE / "corrected-articles")
    parser.add_argument("--corrections", type=Path, required=True)
    parser.add_argument("--enricher", type=Path, default=HERE / "enrich_ted.py")
    parser.add_argument("--dictionaries", type=Path, default=BASE / "dictionaries")
    report = build(parser.parse_args())
    print(json.dumps({"articles": len(report["articles"]), "corrections": report["corrections"],
                      "tokens": report["totals"].get("tokens", 0),
                      "unchangedSourceFilesVerified": report["unchangedSourceFilesVerified"],
                      "tokenRoundTripVerified": report["tokenRoundTripVerified"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
