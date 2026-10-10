import json
import re
import unittest
from collections import Counter
from build_vocabulary import HERE, LEVELS, digest, load_helpers, strict_record

class VocabularySourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = [row for level in LEVELS for row in json.loads((HERE / f"draft/{level.lower()}.json").read_text(encoding="utf-8"))]
        cls.by_id = {row["id"]: row for row in cls.rows}
        cls.helpers = load_helpers()

    def test_stable_ids_and_counts(self):
        self.assertEqual(len(self.rows), 7811)
        self.assertEqual(len(self.by_id), 7811)
        self.assertTrue(all(re.fullmatch(r"lex:openjlpt:[a-f0-9]{10}", x) for x in self.by_id))
        self.assertEqual(Counter(row["level"] for row in self.rows), {"N5":674,"N4":630,"N3":1659,"N2":1778,"N1":3070})

    def test_draft_hashes_and_references(self):
        manifest = json.loads((HERE / "draft/manifest.json").read_text(encoding="utf-8"))
        for item in manifest["files"]:
            self.assertEqual(digest(HERE / "draft" / item["file"]), item["sha256"])
        for filename in ["missing-stable.json", "quarantine-candidates.json", "example-review-candidates.json"]:
            for row in json.loads((HERE / filename).read_text(encoding="utf-8")):
                self.assertIn(row["id"], self.by_id)

    def test_known_soap_and_bill_identity(self):
        soap = self.by_id["lex:openjlpt:b48d0c99d4"]
        self.assertEqual((soap["level"], soap["jmdictId"], soap["meaningEn"], soap["meaningZh"]), ("N5", 1382590, ["soap"], "肥皂"))
        self.assertEqual(soap["pos"], ["n"])
        self.assertEqual(len(soap["examples"]), 2)
        bill = self.by_id["lex:openjlpt:1fb9d39cd6"]
        self.assertIn("building", " ".join(bill["meaningEn"]))
        self.assertNotIn("bill", bill["meaningEn"])
        self.assertEqual(bill["meaningZh"], "楼房；大楼")

    def test_same_writing_different_reading_not_merged(self):
        rows = [row for row in self.rows if row["text"] == "上手"]
        self.assertEqual({row["reading"] for row in rows}, {"うわて", "じょうず"})
        self.assertEqual(len({row["id"] for row in rows}), 2)
        self.assertEqual(len({row["jmdictId"] for row in rows}), 2)

    def test_examples_are_english_and_keep_source_ids(self):
        for row in self.rows:
            for example in row["examples"]:
                self.assertNotIn("chinese", example)
                self.assertIsInstance(example["english"], str)
                self.assertTrue(example["sourceUrl"].endswith(str(example["tatoebaId"])))

    def test_unknown_chinese_not_fabricated(self):
        missing = [row for row in self.rows if row["chineseStatus"] == "missing"]
        self.assertEqual(len(missing), 158)
        self.assertTrue(all("meaningZh" not in row and row["meaningEn"] for row in missing))

    def test_form_of_is_not_a_definition(self):
        record = {"word":"食べた", "lang_code":"ja", "pos":"verb", "forms":[{"form":"食べた","tags":["canonical"],"ruby":[["食","た"]]}], "senses":[{"glosses":["食べる的过去式"],"form_of":[{"word":"食べる"}]}]}
        self.assertIsNone(strict_record(record, self.helpers, Counter()))

    def test_missing_reading_does_not_supply_headword_meaning(self):
        record = {"word":"上手", "lang_code":"ja", "pos":"noun", "senses":[{"glosses":["高手"]}]}
        self.assertIsNone(strict_record(record, self.helpers, Counter()))

    def test_suru_primary_sense(self):
        self.assertEqual(self.by_id["lex:openjlpt:c4cdc162d7"]["meaningZh"], "做")

if __name__ == "__main__":
    unittest.main()
