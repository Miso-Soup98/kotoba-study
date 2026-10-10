"""Recover attribution from official weekly TSV files, streaming end to end."""
import bz2
from collections import Counter, defaultdict
import io
import json
import tarfile
import urllib.request
from build_vocabulary import HERE, LEVELS, dump, digest

BASE = "https://downloads.tatoeba.org/exports/"

def download(relative):
    target = HERE / "tatoeba" / relative.rsplit("/", 1)[-1]
    target.parent.mkdir(exist_ok=True)
    headers = {}
    if not target.exists():
        partial = target.with_suffix(target.suffix + ".partial")
        with urllib.request.urlopen(BASE + relative, timeout=60) as response, partial.open("wb") as stream:
            headers = dict(response.headers)
            for chunk in iter(lambda: response.read(256 * 1024), b""):
                stream.write(chunk)
        partial.replace(target)
    return target, {"file": target.name, "url": BASE + relative, "sha256": digest(target), "bytes": target.stat().st_size, "lastModified": headers.get("Last-Modified"), "license": "CC-BY-2.0-FR"}

def sentence_info(fields):
    ident, lang, text, username = fields[:4]
    return {"id": int(ident), "language": lang, "text": text, "username": None if username in {"", "\\N"} else username, "sourceUrl": "https://tatoeba.org/sentences/show/" + ident, "license": "CC-BY-2.0-FR", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/fr/"}

def main():
    by_japanese = defaultdict(list)
    for level in LEVELS:
        for word in json.loads((HERE / f"draft/{level.lower()}.json").read_text(encoding="utf-8")):
            for example in word["examples"]:
                if example not in by_japanese[example["tatoebaId"]]:
                    by_japanese[example["tatoebaId"]].append(example)
    files = []
    japanese_path, metadata = download("per_language/jpn/jpn_sentences_detailed.tsv.bz2")
    files.append(metadata)
    japanese = {}
    with bz2.open(japanese_path, "rt", encoding="utf-8") as stream:
        for line in stream:
            fields = line.rstrip("\r\n").split("\t")
            if int(fields[0]) in by_japanese:
                japanese[int(fields[0])] = sentence_info(fields)
    print("Japanese attribution matched", len(japanese), flush=True)
    indices_path, metadata = download("jpn_indices.tar.bz2")
    files.append(metadata)
    indexed_english = defaultdict(set)
    with tarfile.open(indices_path, "r|bz2") as archive:
        for member in archive:
            if not member.isfile():
                continue
            raw = archive.extractfile(member)
            with raw as stream:
                for encoded in stream:
                    fields = encoded.decode("utf-8").rstrip("\r\n").split("\t", 2)
                    if int(fields[0]) in by_japanese:
                        indexed_english[int(fields[0])].add(int(fields[1]))
    target_english = {ident for matches in indexed_english.values() for ident in matches}
    english_path, metadata = download("per_language/eng/eng_sentences_detailed.tsv.bz2")
    files.append(metadata)
    english = {}
    with bz2.open(english_path, "rt", encoding="utf-8") as stream:
        for line in stream:
            fields = line.rstrip("\r\n").split("\t")
            if int(fields[0]) in target_english:
                english[int(fields[0])] = sentence_info(fields)
    attributions = []
    rejects = []
    counts = Counter()
    for ident, examples in by_japanese.items():
        for example in examples:
            ja = japanese.get(ident)
            reason = None
            if not ja:
                reason = "japanese-id-not-in-export"
            elif ja["text"] != example["japanese"]:
                reason = "japanese-text-changed-or-mismatch"
            candidates = [english[other] for other in indexed_english.get(ident, set()) if other in english and english[other]["text"] == example["english"]]
            if not reason and len(candidates) != 1:
                reason = "english-translation-not-uniquely-matched"
            if not reason and (not ja["username"] or not candidates[0]["username"]):
                reason = "owner-unavailable"
            if reason:
                counts[reason] += 1
                rejects.append({"tatoebaId": ident, "japanese": example["japanese"], "english": example["english"], "reason": reason})
            else:
                counts["fully-attributed-pair"] += 1
                for item in [ja, candidates[0]]:
                    item["authorUrl"] = "https://tatoeba.org/en/user/profile/" + item["username"]
                attributions.append({"tatoebaId": ident, "japanese": ja, "english": candidates[0]})
    dump(HERE / "tatoeba-attribution.json", attributions)
    dump(HERE / "tatoeba-attribution-rejected.json", rejects)
    dump(HERE / "tatoeba-sources.json", files)
    report = {"uniqueJapaneseIds": len(by_japanese), "uniqueSentencePairs": sum(len(values) for values in by_japanese.values()), "counts": dict(counts), "publicationRule": "Publish only exact-text pairs where both Japanese and English IDs and usernames are matched; show both author profile links and the CC BY 2.0 FR license link. Missing-owner and changed-text pairs are withheld."}
    dump(HERE / "tatoeba-attribution-report.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
