"""Build offline TED token/Chinese dictionary assets without changing OCR sources.

Run from project root with .venv/Scripts/python.exe. Downloads are separate;
this builder makes no network requests. The source glossary is never rewritten.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import shutil
import sys
import unicodedata
from urllib.parse import quote

from sudachipy import dictionary, tokenizer

BASE = Path(__file__).resolve().parents[2] / "private-content" / "ted"
FORMAT_VERSION = 1
POS_ZH = {
    "名詞": "名词", "動詞": "动词", "形容詞": "形容词", "形状詞": "形容动词",
    "副詞": "副词", "連体詞": "连体词", "接続詞": "接续词", "感動詞": "感叹词",
    "助詞": "助词", "助動詞": "助动词", "接頭辞": "接头词", "接尾辞": "接尾词",
    "代名詞": "代词", "補助記号": "标点符号", "記号": "符号", "空白": "空白",
}
POS_COMPATIBLE = {
    "名詞": {"noun", "name", "proper-noun", "num", "counter", "classifier", "suffix", "phrase"},
    "動詞": {"verb", "adj", "aux", "phrase"},
    "形容詞": {"adj", "verb"}, "形状詞": {"adj", "noun"}, "副詞": {"adv", "noun"},
    "連体詞": {"adnominal", "det", "adj", "pron"}, "接続詞": {"conj", "adv"},
    "感動詞": {"intj", "phrase"}, "助詞": {"particle", "postp", "conj"},
    "助動詞": {"aux", "verb", "particle", "suffix"}, "代名詞": {"pron", "noun"},
    "接頭辞": {"prefix"}, "接尾辞": {"suffix", "counter", "classifier", "noun"},
}
TAGS_ZH = {
    "transitive": "及物", "intransitive": "不及物", "archaic": "古旧用法",
    "obsolete": "已废用", "colloquial": "口语", "informal": "非正式",
    "formal": "正式", "honorific": "敬语", "humble": "谦让语", "slang": "俚语",
    "vulgar": "粗俗", "rare": "少见", "derogatory": "贬义", "literary": "书面语",
    "figuratively": "比喻", "abbreviation": "缩略语",
}
LEXICAL_POS = {"名詞", "動詞", "形容詞", "形状詞", "副詞", "連体詞", "接続詞", "感動詞", "代名詞"}
LEGACY_POS = {"名": "noun", "自": "verb", "他": "verb", "自他": "verb", "自サ": "verb", "他サ": "verb", "自他サ": "verb", "サ": "verb", "形": "adj", "形动": "adj", "形動": "adj", "副": "adv", "代": "pron", "连体": "det", "連体": "det", "接": "conj", "接头": "prefix", "接頭": "prefix", "接尾": "suffix", "助": "particle", "感": "intj", "叹": "intj", "数": "num"}
LEGACY_POS.update({prefix + suffix: "verb" for prefix in ("自", "他", "自他") for suffix in ("五", "下一", "上一")})
LEGACY_POS.update({"名詞": "noun", "名词": "noun", "動詞": "verb", "动词": "verb", "形容詞": "adj", "形容词": "adj", "形容動詞": "adj", "形容动词": "adj", "副詞": "adv", "副词": "adv", "助詞": "particle", "助词": "particle"})


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".partial")
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temp.replace(path)


def hira(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in value)


def unique(items):
    return list(dict.fromkeys(item for item in items if item))


def clean_text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def kana_reading(value: str) -> str:
    value = hira(value).strip()
    return value if value and re.fullmatch(r"[ぁ-ゖー・\s]+", value) else ""


def ruby_reading(form: dict) -> str:
    """Reconstruct mixed kana/kanji forms; ruby values alone omit okurigana."""
    value = clean_text(form.get("form"))
    if not value:
        return ""
    output, start = [], 0
    for pair in form.get("ruby", []):
        if not isinstance(pair, list) or len(pair) != 2 or not all(isinstance(x, str) for x in pair):
            return ""
        written, reading = pair
        at = value.find(written, start)
        if at < 0:
            return ""
        output.extend((value[start:at], reading))
        start = at + len(written)
    output.append(value[start:])
    return kana_reading("".join(output))


def legacy_gloss(value: str) -> tuple[str, list[str], list[str], list[str]]:
    """Extract conservative definition lines from old unstructured wiki entries.

    Old Japanese blocks embed heading/readings/POS/examples in one gloss field.
    Keep the first definition and explicitly numbered senses, never guess that
    a subsequent translation of a Japanese example is another definition.
    """
    lines = [x.strip() for x in value.splitlines() if x.strip()]
    if not lines:
        return "", [], [], []
    readings, notes, pos_hints = [], [], []
    header = re.fullmatch(r"(.*?)【([ぁ-ゖァ-ヶー・、／/,\s]+)】\s*(.*)", lines[0])
    heading = ""
    if header:
        heading = header.group(1).strip()
        readings = [kana_reading(x) for x in re.split(r"[・、／/,\s]+", header.group(2))]
        lines = ([header.group(3)] if header.group(3) else []) + lines[1:]
    if lines:
        pos_prefix = lines[0].split(maxsplit=1)
        labels = [x for x in re.split(r"[·・•?、,，]", pos_prefix[0].strip("（）()")) if x]
        if labels and all(label in LEGACY_POS for label in labels):
            pos_hints = unique(LEGACY_POS[label] for label in labels)
            notes.append("原词典词性：" + pos_prefix[0])
            lines = ([pos_prefix[1]] if len(pos_prefix) == 2 else []) + lines[1:]
    if len(lines) <= 1:
        return lines[0] if lines else "", unique(readings), notes, pos_hints
    definitions = []
    for index, line in enumerate(lines):
        # E.g. 住民 -> 住民税 -> ①所得税: nested subentry numbering isn't
        # another meaning of 住民. Stop at a clear bare compound heading.
        if heading and line.startswith(heading) and line != heading and re.fullmatch(r"[一-鿿々ぁ-ゖァ-ヺー()（）]+", line):
            break
        # Circled numbering also appears inside translated examples/subentries;
        # importing it as a top-level definition is unsafe (e.g. 一服/住民).
        if re.match(r"^(?:\d+[.．、)]\s*)?[①②③④⑤⑥⑦⑧⑨⑩]", line):
            continue
        numbered = bool(re.match(r"^\d+[.．、)]\s*", line))
        if index == 0 or numbered:
            # Japanese examples contain kana. Retain no unlabelled Japanese
            # line from a multiline legacy block as a Chinese definition.
            if re.search(r"[ぁ-ゖァ-ヺ]", line) and not numbered:
                continue
            definitions.append(line)
    return "；".join(definitions), unique(readings), notes, pos_hints


def compact_record(record: dict) -> dict | None:
    if record.get("lang_code") != "ja" or record.get("pos") in {"character", "symbol", "punct"}:
        return None
    term = clean_text(record.get("word"))
    if not term:
        return None
    readings = []
    for form in record.get("forms", []):
        if "canonical" in form.get("tags", []) or form.get("form") == term:
            readings.append(ruby_reading(form))
    if not any(readings):
        readings.extend(kana_reading(sound.get("other", "")) for sound in record.get("sounds", []))
    if not any(readings):
        readings.append(kana_reading(term))
    senses, legacy_notes, pos_hints = [], [], []
    for sense in record.get("senses", []):
        glosses = []
        for value in sense.get("glosses", []):
            gloss, old_readings, old_notes, old_pos = legacy_gloss(clean_text(value))
            if gloss:
                glosses.append(gloss)
            readings.extend(old_readings)
            legacy_notes.extend(old_notes)
            pos_hints.extend(old_pos)
        glosses = unique(glosses)
        if glosses:
            senses.append({"gloss": "；".join(glosses), "tags": unique(TAGS_ZH.get(x, "") for x in sense.get("tags", []))})
    if not senses:
        return None
    # Dictionary quotation examples, audio links and etymologies are intentionally
    # excluded: they may have separate rights and aren't needed for this reader.
    notes = unique([*legacy_notes, *(clean_text(x) for x in record.get("notes", []) if isinstance(x, str) and len(x) <= 240 and "―" not in x and not re.search(r"(?:ISBN|https?://|\d{4}年)", x))])[:3]
    form_values = {f.get("form", "") for f in record.get("forms", [])}
    grammatical_metadata = " ".join([*legacy_notes, *(c.get("name", "") for c in record.get("categories", []))])
    verb_class = ""
    if {"し", "せよ", "させる"}.issubset(form_values) or any("サ" in note for note in legacy_notes) or "サ行" in grammatical_metadata:
        verb_class = "suru"
    elif "五段" in grammatical_metadata or any(re.search(r"[自他]五", note) for note in legacy_notes):
        verb_class = "godan"
    elif "一段" in grammatical_metadata or any("下一" in note or "上一" in note for note in legacy_notes):
        verb_class = "ichidan"
    return {"term": term, "readings": unique(readings), "pos": record.get("pos", "unknown"), "posHints": unique(pos_hints), "verbClass": verb_class, "senses": senses, "notes": notes}


class ChineseDictionary:
    def __init__(self, directory: Path, allow_partial: bool = False):
        self.records = defaultdict(list)
        self.stats = Counter()
        seen = set()
        paths = sorted(directory.glob("kaikki-ja-*.jsonl"))
        self.complete = len(paths) == 2
        if not paths or (not self.complete and not allow_partial):
            raise ValueError("Expected both Kaikki Japanese JSONL downloads")
        for path in paths:
            with path.open(encoding="utf-8") as f:
                for line in f:
                    raw = json.loads(line)
                    self.stats["rawRecords"] += 1
                    record = compact_record(raw)
                    if not record:
                        continue
                    fingerprint = json.dumps(record, ensure_ascii=False, sort_keys=True)
                    if fingerprint in seen:
                        self.stats["duplicateRecordsRemoved"] += 1
                        continue
                    seen.add(fingerprint)
                    self.records[record["term"]].append(record)
                    self.stats["usableRecords"] += 1
        self.stats["headwords"] = len(self.records)

    def find(self, term: str, reading: str, pos: tuple[str, ...], counter_context: bool = False) -> list[dict]:
        allowed = set(POS_COMPATIBLE.get(pos[0], set()))
        if pos[0] == "名詞" and "副詞可能" in pos:
            allowed.add("adv")
        if pos[0] == "名詞" and "形状詞可能" in pos:
            allowed.add("adj")
        candidates = [r for r in self.records.get(term, []) if (r["pos"] in allowed or (r["pos"] in {"unknown", ""} and (not r["posHints"] or bool(allowed.intersection(r["posHints"])))))]
        if not candidates:
            return []
        if reading:
            matching = [r for r in candidates if reading in r["readings"]]
            if matching:
                candidates = matching
            # A known contradictory reading must never supply the meaning.
            # Unlabelled entries remain candidates, explicitly not contextual senses.
            else:
                candidates = [r for r in candidates if not r["readings"]]
        expected_class = "suru" if "サ行変格" in pos else "godan" if pos[4].startswith("五段") else "ichidan" if "一段" in pos[4] else ""
        if expected_class:
            candidates = [r for r in candidates if r["verbClass"] in {"", expected_class}]
            same_class = [r for r in candidates if r["verbClass"] == expected_class]
            if same_class:
                candidates = same_class
        if counter_context:
            classifiers = [r for r in candidates if r["pos"] in {"counter", "classifier"}]
            if classifiers:
                candidates = classifiers
        return candidates


class Enricher:
    def __init__(self, chinese: ChineseDictionary):
        self.chinese = chinese
        self.tokenizer = dictionary.Dictionary(dict="small").create()
        self.lemma_readings: dict[str, str] = {}
        self.unknown = Counter()

    def base_reading(self, lemma: str) -> str:
        if lemma not in self.lemma_readings:
            parts = self.tokenizer.tokenize(lemma, tokenizer.Tokenizer.SplitMode.B)
            self.lemma_readings[lemma] = "" if any(p.is_oov() for p in parts) else hira("".join(p.reading_form() for p in parts))
        return self.lemma_readings[lemma]

    @staticmethod
    def usage(pos: tuple[str, ...]) -> str:
        out = [POS_ZH.get(pos[0], pos[0])]
        out.extend(x for x in pos[1:4] if x != "*")
        if pos[4] != "*":
            out.append("活用类型：" + pos[4])
        if pos[5] != "*":
            out.append("活用形式：" + pos[5])
        return "；".join(unique(out))

    def lookup(self, article: dict, surface: str, lemma: str, reading: str, pos: tuple[str, ...], counter_context: bool = False) -> tuple[dict | None, str]:
        lemma_reading = reading if lemma == surface else self.base_reading(lemma)
        for term, expected in unique([(lemma, lemma_reading), (surface, reading)]):
            matches = [g for g in article.get("glossary", []) if not g.get("uncertainTerm") and g.get("term") == term and clean_text(g.get("meaning")) and (not g.get("reading") or not expected or hira(g["reading"]) == expected)]
            if matches:
                meanings = unique(clean_text(g["meaning"]) for g in matches)
                usage = unique([self.usage(pos), *(clean_text(g.get("usage")) for g in matches)])
                source = "本篇 PDF 词汇栏（OCR 待核对）" if any(g.get("reviewRequired") for g in matches) else "本篇 PDF 词汇栏（原样保留）"
                return {"term": term, "reading": expected or clean_text(matches[0].get("reading")), "meaning": "；".join(meanings), "usage": "；".join(usage), "examples": [], "page": matches[0].get("page", 0), "source": source}, "pdf"
        for term, expected in unique([(lemma, lemma_reading), (surface, reading)]):
            records = self.chinese.find(term, expected, pos, counter_context=counter_context)
            if not records:
                continue
            meanings = unique(("【" + "、".join(s["tags"]) + "】" if s["tags"] else "") + s["gloss"] for r in records for s in r["senses"])
            notes = unique(n for r in records for n in r["notes"])
            return {"term": term, "reading": expected or next((x for r in records for x in r["readings"]), ""), "meaning": "；".join(meanings), "usage": "；".join([self.usage(pos), "词典候选义项，需结合原句判断", *notes]), "examples": [], "page": 0, "source": "中文维基词典／Kaikki（CC BY-SA 4.0） https://zh.wiktionary.org/wiki/" + quote(term, safe="")}, "kaikki"
        return None, "missing"

    def enrich(self, article: dict) -> tuple[dict, dict]:
        # Clone to ensure no caller's OCR data/glossary can be mutated.
        article = json.loads(json.dumps(article, ensure_ascii=False))
        if article.get("id") == "ted-new-001" and any(g.get("term") == "摂る" and g.get("meaning") == "握住；驾驶；捉住；得到" for g in article.get("glossary", [])):
            warning = "词义待核对：原 PDF 词汇栏「摂る」写作「握住；驾驶；捉住；得到」，与正文「食事を摂る」的进食语境不贴合；原释义保留，阅读时请结合原句。"
            if warning not in article.setdefault("warnings", []):
                article["warnings"].append(warning)
        entries = {}
        stats = Counter()
        stats["ocrReviewArticles"] = int(bool(article.get("extraction", {}).get("reviewRequired")))
        stats["uncertainGlossaryTermsIgnored"] = sum(bool(g.get("uncertainTerm")) for g in article.get("glossary", []))
        for paragraph in article["paragraphs"]:
            text = paragraph["japanese"]
            stats["emptyJapaneseParagraphs"] += int(not text.strip())
            stats["missingChineseParagraphs"] += int(bool(text.strip()) and not paragraph.get("chinese", "").strip())
            tokens = []
            previous_pos: tuple[str, ...] | None = None
            for morph in self.tokenizer.tokenize(text, tokenizer.Tokenizer.SplitMode.B):
                surface, lemma = morph.surface(), morph.dictionary_form()
                pos = morph.part_of_speech()
                reading = "" if morph.is_oov() and not kana_reading(surface) else hira(morph.reading_form())
                if pos[0] in {"補助記号", "記号", "空白"}:
                    reading = ""
                token = {"surface": surface, "lemma": lemma, "reading": reading, "pos": "／".join(x for x in pos if x != "*")}
                stats["tokens"] += 1
                study_word = pos[0] not in {"補助記号", "記号", "空白"} and "数詞" not in pos
                lexical = study_word and pos[0] in LEXICAL_POS
                if study_word:
                    stats["studyTokens"] += 1
                    stats["lexicalTokens"] += int(lexical)
                    stats["morphologyUnknownTokens"] += int(morph.is_oov())
                    stats["missingReadings"] += int(not reading)
                    counter_context = any("助数詞" in field for field in pos) and (pos[0] == "接尾辞" or bool(previous_pos and "数詞" in previous_pos))
                    entry, kind = self.lookup(article, surface, lemma, reading, pos, counter_context=counter_context)
                    if entry:
                        fingerprint = json.dumps(entry, ensure_ascii=False, sort_keys=True)
                        key = kind + "-" + hashlib.sha256(fingerprint.encode()).hexdigest()[:20]
                        entries[key] = entry
                        token["dictionaryId"] = key
                        stats[kind + "CoveredTokens"] += 1
                        stats["coveredTokens"] += 1
                        stats["lexicalCoveredTokens"] += int(lexical)
                    else:
                        stats["missingMeaningTokens"] += 1
                        if lexical:
                            self.unknown[(lemma, reading, pos[0])] += 1
                tokens.append(token)
                if pos[0] != "空白":
                    previous_pos = pos
            if "".join(t["surface"] for t in tokens) != text:
                raise AssertionError(f"Lossless token round-trip failed: {article['id']}/{paragraph['id']}")
            paragraph["tokens"] = tokens
            stats["paragraphs"] += 1
        article["dictionary"] = entries
        article["dictionaryBuild"] = {"version": FORMAT_VERSION, "tokenizer": "SudachiPy 0.6.10 / SudachiDict-small 20260723 / SplitMode.B", "glossaryPriority": "source-pdf", "dictionaryLicense": "CC-BY-SA-4.0", "contextualSenseDisambiguation": False, "dictionaryDownloadsComplete": self.chinese.complete}
        return article, dict(stats)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=BASE / "export")
    parser.add_argument("--output", type=Path, default=BASE / "enriched")
    parser.add_argument("--dictionaries", type=Path, default=BASE / "dictionaries")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--allow-partial-dictionary", action="store_true", help="Preview only: use one completed download while the other is in progress")
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        raise ValueError("Output must differ from the source OCR directory")
    for package, version in [("SudachiPy", "0.6.10"), ("SudachiDict-small", "20260723")]:
        if importlib.metadata.version(package) != version:
            raise ValueError(f"Expected {package}=={version}")
    paths = sorted(args.input.glob("ted-*.json"))
    if args.limit:
        paths = paths[:args.limit]
    if not paths:
        raise ValueError("No article JSON files found")
    chinese = ChineseDictionary(args.dictionaries, allow_partial=args.allow_partial_dictionary)
    enricher = Enricher(chinese)
    totals, articles = Counter(), []
    for path in paths:
        source_bytes = path.read_bytes()
        raw = json.loads(source_bytes)
        if not isinstance(raw, dict) or "paragraphs" not in raw:
            continue
        result, stats = enricher.enrich(raw)
        write_json(args.output / path.name, result)
        totals.update(stats)
        articles.append({"id": result["id"], "sourceSha256": hashlib.sha256(source_bytes).hexdigest(), **stats})
        if len(articles) % 25 == 0:
            print(f"Enriched {len(articles)} articles", flush=True)
    totals["articles"] = len(articles)
    report = {"builtAt": datetime.now(timezone.utc).isoformat(), "formatVersion": FORMAT_VERSION, "dictionaryIndex": dict(chinese.stats), "totals": dict(totals), "meaningCoverage": round(totals["coveredTokens"] / totals["studyTokens"], 6) if totals["studyTokens"] else 0, "lexicalMeaningCoverage": round(totals["lexicalCoveredTokens"] / totals["lexicalTokens"], 6) if totals["lexicalTokens"] else 0, "topUnknownLexicalWords": [{"lemma": key[0], "reading": key[1], "pos": key[2], "count": count} for key, count in enricher.unknown.most_common(200)], "articles": articles, "guarantees": ["Original paragraph text and glossary preserved", "Token surfaces concatenate exactly to each original paragraph", "No dictionary quotation examples or audio imported", "No network requests from this build script", "Missing meanings remain absent; candidate senses are not contextual disambiguation"], "limitations": ["OCR and original PDF language errors are preserved", "Proper names, new words and compounds can be unknown", "Automatic readings and token boundaries are not manually audited", "PDF glossary phrases may span several tokens; reader can prefer exact glossary spans"]}
    report["dictionaryDownloadsComplete"] = chinese.complete
    report["unknownMeaningRate"] = round(1 - report["meaningCoverage"], 6)
    report["lexicalUnknownMeaningRate"] = round(1 - report["lexicalMeaningCoverage"], 6)
    report["coverageDenominators"] = {"studyTokens": "All token occurrences except punctuation/space/symbol POS and number POS", "lexicalTokens": "Noun, verb, adjective, adjectival noun, adverb, adnominal, conjunction, interjection and pronoun occurrences (excluding number POS)"}
    write_json(args.output / "build-report.json", report)
    manifest = args.dictionaries / "download-manifest.json"
    if manifest.exists():
        shutil.copyfile(manifest, args.output / "dictionary-sources.json")
    license_dir = args.dictionaries / "licenses"
    if license_dir.exists():
        for source in license_dir.iterdir():
            if source.is_file():
                target = args.output / "licenses" / source.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
    (args.output / "THIRD_PARTY_NOTICES.md").write_text("""# TED 离线查词数据来源

分词工具：SudachiPy 0.6.10；分词字典：SudachiDict-small 20260723。
项目：https://github.com/WorksApplications/SudachiPy 、https://github.com/WorksApplications/SudachiDict 。
两者采用 Apache-2.0，字典的 UniDic / NEologd 等来源声明见 licenses/SudachiDict-LEGAL.txt。
这些构建工具及完整分词字典没有打包到文章 JSON 中。

补充中文词义来自中文维基词典贡献者，由 Kaikki / Wiktextract 提取。
https://zh.wiktionary.org/ 及 https://kaikki.org/zhwiktionary/ 。
词典衍生部分采用 CC BY-SA 4.0；完整条款见 licenses/CC-BY-SA-4.0.txt。
每条词义的 source 字段保留原词条链接；下载文件、时间、校验和见 dictionary-sources.json。
处理修改：只取日语；合并简繁标题组、去重、提取原形/读音/词性/中文义项，
从旧格式文本中提取明确的读音和编号定义，排除结构化引文、音频和词源。
词典候选义项没有经过上下文词义消歧；例句由阅读界面展示当前文章原句。

原 PDF 正文、原译文及 glossary 保持不变，保留其原有来源和权利状态；
此词典许可不宣称涵盖原 PDF 内容，也不改变应用代码本身的许可证。
""", encoding="utf-8")
    print(json.dumps({"totals": dict(totals), "meaningCoverage": report["meaningCoverage"], "lexicalMeaningCoverage": report["lexicalMeaningCoverage"], "output": str(args.output)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
