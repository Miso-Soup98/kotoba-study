import json
from pathlib import Path
import tempfile
import unittest

from enrich_ted import ChineseDictionary, Enricher, compact_record, hira, legacy_gloss, ruby_reading


class EnrichmentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        records = [
            {"word": "食べる", "lang_code": "ja", "pos": "verb", "forms": [{"form": "食べる", "tags": ["canonical"], "ruby": [["食", "た"]]}], "senses": [{"glosses": ["吃"], "examples": [{"text": "不可打包的词典引文", "ref": "第三方作品"}]}]},
            {"word": "明日", "lang_code": "ja", "pos": "noun", "forms": [{"form": "明日", "tags": ["canonical"], "ruby": [["明日", "みょうにち"]]}], "senses": [{"glosses": ["明天（正式）"]}]},
            {"word": "上手", "lang_code": "ja", "pos": "adj", "forms": [{"form": "上手", "tags": ["canonical"], "ruby": [["上手", "じょうず"]]}], "senses": [{"glosses": ["擅长"]}]},
            {"word": "上手", "lang_code": "ja", "pos": "noun", "forms": [{"form": "上手", "tags": ["canonical"], "ruby": [["上手", "かみて"]]}], "senses": [{"glosses": ["舞台上方"]}]},
        ]
        for name, rows in [("simplified", records), ("traditional", [records[0]])]:
            (root / f"kaikki-ja-{name}.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
        self.dictionary = ChineseDictionary(root)
        self.enricher = Enricher(self.dictionary)

    def tearDown(self):
        self.directory.cleanup()

    @staticmethod
    def article(text, glossary=None):
        return {"id": "ted-test-001", "paragraphs": [{"id": "p1", "page": 1, "japanese": text, "chinese": "原译文"}], "glossary": glossary or [], "warnings": ["OCR 原警告"]}

    def test_inflected_verb_uses_lemma_and_retains_surface(self):
        article, stats = self.enricher.enrich(self.article("昨日は食べました。"))
        token = next(t for t in article["paragraphs"][0]["tokens"] if t["lemma"] == "食べる")
        self.assertEqual(token["surface"], "食べ")
        self.assertEqual(token["reading"], "たべ")
        entry = article["dictionary"][token["dictionaryId"]]
        self.assertEqual((entry["term"], entry["reading"], entry["meaning"]), ("食べる", "たべる", "吃"))
        self.assertEqual(entry["examples"], [])
        self.assertNotIn("不可打包", json.dumps(article, ensure_ascii=False))
        self.assertGreater(stats["kaikkiCoveredTokens"], 0)

    def test_exact_roundtrip_including_spaces_newlines_and_astral_characters(self):
        text = "食べる　🍣\n 𠮷野家で食べました。\tABC １２３"
        article, _ = self.enricher.enrich(self.article(text))
        self.assertEqual("".join(t["surface"] for t in article["paragraphs"][0]["tokens"]), text)
        self.assertEqual(article["paragraphs"][0]["japanese"], text)

    def test_pdf_glossary_wins_without_rewriting_source(self):
        glossary = [{"term": "食べる", "reading": "たべる", "meaning": "PDF 原释义", "usage": "PDF 原用法", "page": 4, "examples": [{"japanese": "原例句", "chinese": "原翻译"}]}]
        raw = self.article("食べました。", glossary)
        before = json.dumps(raw, ensure_ascii=False)
        article, stats = self.enricher.enrich(raw)
        entry = next(iter(article["dictionary"].values()))
        self.assertEqual(entry["meaning"], "PDF 原释义")
        self.assertEqual(entry["page"], 4)
        self.assertEqual(article["glossary"], glossary)
        self.assertEqual(json.dumps(raw, ensure_ascii=False), before)
        self.assertEqual(stats["pdfCoveredTokens"], 1)

    def test_unknown_meaning_is_absent_not_invented(self):
        article, stats = self.enricher.enrich(self.article("光合成を研究する。"))
        self.assertEqual(article["dictionary"], {})
        self.assertFalse(any("dictionaryId" in t for t in article["paragraphs"][0]["tokens"]))
        self.assertGreater(stats["missingMeaningTokens"], 0)

    def test_uncertain_ocr_glossary_does_not_override_known_dictionary(self):
        glossary = [{"term": "食べる", "reading": "たべる", "meaning": "错配 OCR 释义", "uncertainTerm": True, "reviewRequired": True, "page": 1}]
        article, stats = self.enricher.enrich(self.article("食べる。", glossary))
        self.assertEqual(article["glossary"], glossary)
        entry = next(iter(article["dictionary"].values()))
        self.assertEqual(entry["meaning"], "吃")
        self.assertEqual(stats["uncertainGlossaryTermsIgnored"], 1)
        self.assertNotIn("pdfCoveredTokens", stats)

    def test_chinese_only_unpaired_paragraph_is_preserved_with_empty_tokens(self):
        article, stats = self.enricher.enrich(self.article(""))
        self.assertEqual(article["paragraphs"][0]["tokens"], [])
        self.assertEqual(article["paragraphs"][0]["chinese"], "原译文")
        self.assertEqual(stats["emptyJapaneseParagraphs"], 1)

    def test_wrong_reading_and_wrong_pos_are_not_attached(self):
        noun = ("名詞", "普通名詞", "一般", "*", "*", "*")
        adjective = ("形状詞", "一般", "*", "*", "*", "*")
        self.assertEqual(self.dictionary.find("明日", "あした", noun), [])
        matches = self.dictionary.find("上手", "じょうず", adjective)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["senses"][0]["gloss"], "擅长")

    def test_readings_preserve_okurigana_and_duplicates_are_removed(self):
        self.assertEqual(ruby_reading({"form": "食べる", "ruby": [["食", "た"]]}), "たべる")
        self.assertEqual(ruby_reading({"form": "行き来", "ruby": [["行", "い"], ["来", "き"]]}), "いきき")
        self.assertEqual(hira("ｶﾀｶﾅ"), "かたかな")
        self.assertEqual(self.dictionary.stats["duplicateRecordsRemoved"], 1)
        self.assertIsNone(compact_record({"word": "食", "lang_code": "ja", "pos": "character", "senses": [{"glosses": ["汉字字义"]}]}))

    def test_unstructured_gloss_extracts_reading_pos_and_excludes_examples(self):
        result = legacy_gloss("整理【せいり】\n名·他サ\n1. 整理，收拾。\n2. 清理，处理。\n3. 精简。\n人員整理\n精简人员。")
        self.assertEqual(result[0], "1. 整理，收拾。；2. 清理，处理。；3. 精简。")
        self.assertEqual(result[1], ["せいり"])
        self.assertEqual(result[3], ["noun", "verb"])
        self.assertNotIn("精简人员", result[0])
        self.assertEqual(legacy_gloss("一口【ひとくち】\n1. 一口，一次。\nほんの一口食べる\n吃一口。\n2. 一言，一句话。\n一口話\n笑话，短篇笑话。")[0], "1. 一口，一次。；2. 一言，一句话。")
        self.assertEqual(legacy_gloss("住民【じゅうみん】\n1. 居民，住民。\n住民税\n①所得税。\n2. ②人头税。")[0], "1. 居民，住民。")
        self.assertEqual(legacy_gloss("提供【ていきょう】\n名·他サ 提供，供给。")[0], "提供，供给。")
        self.assertEqual(legacy_gloss("甘やかす【あまやかす】\n他五\n娇惯，纵容。")[0], "娇惯，纵容。")
        self.assertEqual(legacy_gloss("暗記【あんき】\n名?他サ\n背诵。")[3], ["noun", "verb"])
        self.assertEqual(legacy_gloss("助け【たすけ】\n1. 帮助，援助。\n助け船(ぶね)\n①救生船。\n2. ②困难时给予帮助。")[0], "1. 帮助，援助。")
        self.assertEqual(legacy_gloss("一服【いっぷく】\n名\n茶，香烟、药的\n1. 一杯，一支，一服。\n一服どうぞ\n①请喝杯茶。\n2. ②请吸支烟。\n名?自他サ 休息。\n一服盛る\n下毒。")[0], "茶，香烟、药的；1. 一杯，一支，一服。")

    def test_known_verb_class_prevents_suru_homograph_contamination(self):
        records = [
            {"word": "する", "lang_code": "ja", "pos": "verb", "forms": [{"form": x} for x in ["し", "せよ", "させる"]], "senses": [{"glosses": ["做"]}]},
            {"word": "する", "lang_code": "ja", "pos": "verb", "senses": [{"glosses": ["扒窃"]}]},
        ]
        self.dictionary.records["する"] = [compact_record(r) for r in records]
        matches = self.dictionary.find("する", "する", ("動詞", "非自立可能", "*", "*", "サ行変格", "連用形-一般"))
        self.assertEqual([r["senses"][0]["gloss"] for r in matches], ["做"])

    def test_adnominal_pos_does_not_drop_common_kono_or_pick_numeral(self):
        self.dictionary.records["この"] = [compact_record({"word": "この", "lang_code": "ja", "pos": pos, "senses": [{"glosses": [meaning]}]}) for pos, meaning in [("adnominal", "这个"), ("num", "九")]]
        matches = self.dictionary.find("この", "この", ("連体詞", "*", "*", "*", "*", "*"))
        self.assertEqual([r["senses"][0]["gloss"] for r in matches], ["这个"])

    def test_classifier_after_number_does_not_become_sunday(self):
        self.dictionary.records["日"] = [compact_record({"word": "日", "lang_code": "ja", "pos": pos, "forms": [{"form": "日", "tags": ["canonical"], "ruby": [["日", "にち"]]}], "senses": [{"glosses": [meaning]}]}) for pos, meaning in [("noun", "星期日"), ("classifier", "天数；月份中的某一天")]]
        article, _ = self.enricher.enrich(self.article("1日の食事。"))
        token = next(t for t in article["paragraphs"][0]["tokens"] if t["surface"] == "日")
        entry = article["dictionary"][token["dictionaryId"]]
        self.assertEqual(entry["meaning"], "天数；月份中的某一天")


if __name__ == "__main__":
    unittest.main()
