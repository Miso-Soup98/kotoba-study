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

    def test_review_metadata_never_copies_local_source_paths(self):
        report = {"articleId": self.article["id"], "reviewedAt": "2026-09-29", "remainingIssues": ["待试听"],
                  "sourceHeadingJapanese": "例", "sourcePdf": "private/path.pdf", "inputJson": "private.json"}
        result = module.apply_learning_overlays(copy.deepcopy(self.article), [], [], [report])
        self.assertEqual(set(result["review"]), {"reviewedAt", "remainingIssues", "sourceHeadingJapanese"})


if __name__ == "__main__":
    unittest.main()
