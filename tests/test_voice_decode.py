"""Offline decode guard checks with a bounded fake FFmpeg output; no synthesis."""
from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
from subprocess import CompletedProcess
import tempfile
import unittest
from unittest.mock import patch

APP = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('voice_decode_under_test', APP / 'scripts' / 'generate_voice_samples.py')
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)


class VoiceDecodeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'sample.mp3'
        self.content = b'fixture-for-audio-checksum' * 30
        self.path.write_bytes(self.content)

    def test_valid_audio_hashes_in_chunks_and_preserves_measurements(self):
        pcm = b'\xe8\x03' * (voice.SAMPLE_RATE // 2)
        with patch.object(voice.subprocess, 'run', return_value=CompletedProcess([], 0, pcm, b'')), \
                patch.object(Path, 'read_bytes', side_effect=AssertionError('must not load the full source file')):
            measured = voice.decode(self.path, 'fake-ffmpeg')
        self.assertEqual(measured['durationSeconds'], 0.5)
        self.assertEqual(measured['peakPcm'], 1000)
        self.assertEqual(measured['sha256'], hashlib.sha256(self.content).hexdigest())

    def test_overlong_audio_is_output_limited_then_rejected(self):
        def fake_decode(command, **options):
            self.assertEqual(command[command.index('-t') + 1], '61')
            self.assertLessEqual(options['timeout'], 60)
            return CompletedProcess(command, 0, b'\xe8\x03' * (voice.SAMPLE_RATE * 61), b'')
        with patch.object(voice.subprocess, 'run', side_effect=fake_decode):
            with self.assertRaisesRegex(ValueError, '时长异常'):
                voice.decode(self.path, 'fake-ffmpeg')

    def test_failed_or_silent_audio_remains_rejected(self):
        for result, message in [(CompletedProcess([], 1, b'', b'decode failed'), '解码失败'),
                                (CompletedProcess([], 0, b'\x00\x00' * voice.SAMPLE_RATE, b''), '全静音')]:
            with self.subTest(message=message), patch.object(voice.subprocess, 'run', return_value=result):
                with self.assertRaisesRegex(ValueError, message):
                    voice.decode(self.path, 'fake-ffmpeg')


if __name__ == '__main__':
    unittest.main()
