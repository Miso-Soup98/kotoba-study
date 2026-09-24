#!/usr/bin/env python3
"""Offline structural checks only: does not validate grammar or generate speech."""
from __future__ import annotations
import ast
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECTED = {'N5': 87, 'N4': 129, 'N3': 183, 'N2': 223}


def verify() -> dict:
    data = json.loads((ROOT.parent / 'public/data/grammar.json').read_text(encoding='utf-8'))
    entries = data['entries']
    if len(entries) != 622:
        raise ValueError(f'Expected 622 entries; got {len(entries)}')
    ids = [e['id'] for e in entries]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate entry IDs')
    counts = Counter(e['level'] for e in entries)
    if dict(counts) != EXPECTED:
        raise ValueError(f'Unexpected level counts: {dict(counts)}')
    expected_ids = [f'{level}-{i:03d}' for level, count in EXPECTED.items() for i in range(1, count + 1)]
    if ids != expected_ids:
        raise ValueError('IDs or ordering differ from the book-aligned baseline')
    fields = ('title', 'meaning', 'usage', 'caution', 'vocabulary')
    example_fields = ('japanese', 'japanese_annotated', 'japanese_reading', 'chinese')
    for entry in entries:
        for field in fields:
            if not isinstance(entry.get(field), str) or not entry[field].strip():
                raise ValueError(f'{entry["id"]}: missing {field}')
        if not isinstance(entry.get('pdf_page'), int) or entry['pdf_page'] < 1:
            raise ValueError(f'{entry["id"]}: invalid page')
        if len(entry.get('examples', [])) != 2:
            raise ValueError(f'{entry["id"]}: expected two examples')
        for example in entry['examples']:
            for field in example_fields:
                if not isinstance(example.get(field), str) or not example[field].strip():
                    raise ValueError(f'{entry["id"]}: missing example {field}')
    for name in ('generate_audio.py', 'verify_project.py'):
        ast.parse((ROOT / name).read_text(encoding='utf-8'), filename=name)
    for name in ('reader.html', 'docs/Japanese_Grammar_N5-N2_Furigana.pdf'):
        path = ROOT.parent / 'public' / name
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f'Missing or empty file: {name}')
    return {'status': 'passed', 'entries': len(entries), 'examples': sum(len(e['examples']) for e in entries),
            'levels': dict(counts), 'python_ast': 'passed', 'audio_synthesis': 'not_run',
            'pronunciation_review': 'not_done', 'scope': 'Structure only, not linguistic or audio quality.'}


if __name__ == '__main__':
    try:
        print(json.dumps(verify(), ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError, TypeError, SyntaxError) as exc:
        print(f'Verification failed: {exc}', file=sys.stderr)
        raise SystemExit(1)
