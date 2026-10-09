"""Offline regression: context-specific speech input must preserve the book."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

APP = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pack', APP / 'scripts/generate_voice_pack.py')
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)
ENTRIES = {e['id']: e for e in json.loads((APP / 'public/data/grammar.json').read_text(encoding='utf-8'))['entries']}


class PronunciationTests(unittest.TestCase):
    def test_ambiguous_minutes_and_sufficiency_have_different_readings(self):
        minutes = pack.plan_for('N5-082', 0, 'nanami', ENTRIES)
        enough = pack.plan_for('N2-001', 1, 'nanami', ENTRIES)
        self.assertIn('じゅっぷん', minutes['speechText'])
        self.assertIn('じゅうぶん', enough['speechText'])
        for plan in (minutes, enough):
            self.assertIn('十分', plan['text'])
            self.assertIn(plan['text'], pack.voice.srt_text(plan['text'], 3.0))
            old_signature = hashlib.sha256(json.dumps([plan['text'], plan['serviceVoice'], pack.voice.RATE], ensure_ascii=False).encode('utf-8')).hexdigest()
            self.assertNotEqual(plan['signature'], old_signature, 'old ambiguous recording must be regenerated')

    def test_stale_override_fails_instead_of_reading_the_wrong_sentence(self):
        with self.assertRaisesRegex(ValueError, '原句已变化'):
            pack.voice.synthesis_text('N5-082', 0, '変更された文章。')

    def test_unrelated_particles_and_noun_ha_remain_unchanged(self):
        plan = pack.plan_for('N5-044', 0, 'keita', ENTRIES)
        self.assertEqual(plan['text'], '寝る前に歯を磨きます。')
        self.assertEqual(plan['speechText'], plan['text'])
        expected = hashlib.sha256(json.dumps([plan['text'], plan['serviceVoice'], pack.voice.RATE], ensure_ascii=False).encode('utf-8')).hexdigest()
        self.assertEqual(plan['signature'], expected, 'unaffected cached recordings remain valid')

    def test_every_override_has_a_real_matching_example(self):
        for entry_id, index in pack.voice.pronunciation_overrides():
            plan = pack.plan_for(entry_id, index, 'nanami', ENTRIES)
            self.assertNotEqual(plan['speechText'], plan['text'])


if __name__ == '__main__':
    unittest.main()
