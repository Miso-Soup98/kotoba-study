"""Offline private-overlay regressions using original tiny fixtures, no dictionary load."""
from __future__ import annotations

import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "ted_corrections", Path(__file__).resolve().parents[1] / "scripts" / "ted" / "apply_corrections.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class OverlayTest(unittest.TestCase):
    def setUp(self):
        self.article = {"id": "ted-new-004", "paragraphs": [
            {"id": "p1", "japanese": "🌸日本について話します。", "chinese": "谈谈日本。"},
            {"id": "p2", "japanese": "", "chinese": "旧碎片"}],
            "glossary": [{"term": "QR-noise", "meaning": "原记录"}]}
        self.lesson = {"id": "context-test", "articleId": self.article["id"], "paragraphId": "p1",
                       "start": 4, "end": 8, "surface": "について", "kind": "grammar",
                       "reviewStatus": "context-reviewed"}

    def test_utf16_offsets_survive_non_bmp_characters(self):
        result = module.apply_learning_overlays(copy.deepcopy(self.article), [], [self.lesson], [])
        self.assertEqual(result["contextLessons"], [self.lesson])
        for change in [{"start": 3}, {"end": 999}, {"surface": "という"}, {"reviewStatus": "automatic"}]:
            with self.assertRaises(ValueError):
                module.apply_learning_overlays(copy.deepcopy(self.article), [], [self.lesson | change], [])

    def test_hidden_records_keep_identity_and_source_while_noise_is_excluded(self):
        operations = [
            {"articleId": self.article["id"], "kind": "merge-translation-fragment",
             "sourceParagraphIds": ["p2"], "targetParagraphIds": ["p1"], "hideParagraphIds": ["p2"]},
            {"articleId": self.article["id"], "kind": "hide-noncontent-glossary", "glossaryIndices": [0]}]
        result = module.apply_learning_overlays(copy.deepcopy(self.article), operations, [self.lesson], [])
        self.assertEqual([p["id"] for p in result["paragraphs"]], ["p1", "p2"])
        self.assertEqual(result["paragraphs"][1]["chinese"], "旧碎片")
        self.assertEqual(result["paragraphs"][1]["sourceMappedTo"], ["p1"])
        self.assertTrue(result["paragraphs"][1]["displayHidden"])
        self.assertTrue(result["glossary"][0]["uncertainTerm"])
        self.assertTrue(result["glossary"][0]["displayHidden"])
        self.assertNotIn("displayHidden", self.article["paragraphs"][1])

    def test_missing_mapping_targets_and_duplicate_lessons_are_rejected(self):
        with self.assertRaises(ValueError):
            module.apply_learning_overlays(copy.deepcopy(self.article), [{"articleId": self.article["id"],
                "kind": "merge", "targetParagraphIds": ["missing"]}], [], [])
        with self.assertRaises(ValueError):
            module.apply_learning_overlays(copy.deepcopy(self.article), [], [self.lesson, self.lesson], [])

    def test_qr_noise_is_hidden_without_inventing_a_content_mapping(self):
        operation = {"articleId": self.article["id"], "kind": "hide-noncontent-paragraph",
                     "sourceParagraphIds": ["p2"], "hideParagraphIds": ["p2"]}
        result = module.apply_learning_overlays(copy.deepcopy(self.article), [operation], [], [])
        self.assertTrue(result["paragraphs"][1]["displayHidden"])
        self.assertEqual(result["paragraphs"][1]["sourceMappedTo"], [])
        self.assertEqual(result["paragraphs"][1]["chinese"], "旧碎片")
        for change in [{"hideParagraphIds": []}, {"hideParagraphIds": ["missing"]}, {"targetParagraphIds": ["p1"]}]:
            with self.assertRaises(ValueError):
                module.apply_learning_overlays(copy.deepcopy(self.article), [operation | change], [], [])

    def test_review_metadata_never_copies_local_source_paths(self):
        report = {"articleId": self.article["id"], "reviewedAt": "2026-09-29", "remainingIssues": ["待试听"],
                  "sourceHeadingJapanese": "例", "sourcePdf": "private/path.pdf", "inputJson": "private.json"}
        result = module.apply_learning_overlays(copy.deepcopy(self.article), [], [], [report])
        self.assertEqual(set(result["review"]), {"reviewedAt", "remainingIssues", "sourceHeadingJapanese"})

    def test_text_audit_marks_uncertain_fields_without_claiming_pdf_verification(self):
        review = {"articleId": self.article["id"], "reviewedAt": "2026-10-10", "method": "text-audit",
                  "remainingIssues": ["译文缺段"], "paragraphNotes": {"p1": "译文缺段"},
                  "glossaryNotes": {"0": {"note": "词头不完整", "blockLookup": True}}}
        result = module.apply_learning_overlays(copy.deepcopy(self.article), [], [], [review])
        self.assertEqual(result["review"]["method"], "text-audit")
        self.assertEqual(result["paragraphs"][0]["reviewNote"], "译文缺段")
        self.assertTrue(result["glossary"][0]["uncertainTerm"])
        self.assertNotIn("paragraphNotes", result["review"])
        self.assertNotIn("reviewNote", self.article["paragraphs"][0])
        with self.assertRaises(ValueError):
            module.apply_learning_overlays(copy.deepcopy(self.article), [], [], [review | {"paragraphNotes": {"bad": "错误目标"}}])

    def test_reading_only_correction_does_not_certify_an_uncertain_term(self):
        original = {"term": "欠け", "reading": "かげ", "meaning": "残文", "uncertainTerm": True}
        article = {"id": "ted-new-001", "paragraphs": [], "glossary": [original]}
        record = {"id": "test-reading", "articleId": article["id"], "kind": "glossary", "glossaryIndex": 0,
                  "original": original, "correctedReading": "かけ", "keepTermUncertainty": True}
        result = module.apply_article(article, [record])
        self.assertTrue(result["glossary"][0]["uncertainTerm"])
        self.assertTrue(result["glossary"][0]["reviewRequired"])

    def test_missing_glossary_insertion_preserves_reviewed_usage(self):
        record = {"id": "insert", "kind": "glossary", "operation": "insert-missing-glossary",
                  "term": "について", "original": {}, "correctedMeaning": "关于",
                  "correctedUsage": "名词＋について", "reference": {"page": 1}}
        result = module.apply_article(self.article, [record])
        self.assertEqual(result["glossary"][-1]["usage"], "名词＋について")

    def test_fresh_review_replaces_stale_notes_but_only_resolves_named_glossary(self):
        article = copy.deepcopy(self.article)
        article["paragraphs"][0]["reviewNote"] = "旧缺字"
        article["glossary"][0].update(reviewNote="旧疑点", uncertainTerm=True)
        article["glossary"].append({"term": "未审", "uncertainTerm": True})
        review = {"articleId": article["id"], "remainingIssues": [], "method": "pdf-compared",
                  "resolvedGlossaryIndices": [0], "paragraphNotes": {"p1": "原PDF观点已加订正说明"}}
        result = module.apply_learning_overlays(article, [], [], [review])
        self.assertEqual(result["paragraphs"][0]["reviewNote"], "原PDF观点已加订正说明")
        self.assertEqual(result["glossary"][0]["reviewNote"], "")
        self.assertFalse(result["glossary"][0]["uncertainTerm"])
        self.assertTrue(result["glossary"][1]["uncertainTerm"])

    def test_stored_lessons_reanchor_only_when_unique_and_keep_previous_location(self):
        article = copy.deepcopy(self.article)
        article["contextLessons"] = [self.lesson]
        article["paragraphs"][0]["japanese"] = "今日は🌸日本について話します。"
        result = module.apply_learning_overlays(article, [], [], [])
        self.assertEqual(result["contextLessons"][0]["start"], 7)
        self.assertEqual(result["contextLessons"][0]["previousAnchor"]["start"], 4)
        article["paragraphs"][0]["japanese"] = "今日は🌸日本について、桜について話します。"
        article["contextLessons"] = [self.lesson]
        with self.assertRaises(ValueError):
            module.apply_learning_overlays(article, [], [], [])


if __name__ == "__main__":
    unittest.main()
