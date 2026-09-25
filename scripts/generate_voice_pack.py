#!/usr/bin/env python3
"""Verify the installed voice pack by default; explicitly select IDs to extend it.

Offline (default): python scripts/generate_voice_pack.py [--verify-only]
Authorized extension: python scripts/generate_voice_pack.py --entries N3-001 N3-002

The manifest is merged, never replaced with only the requested subset. Requests
use the existing sequential edge-tts implementation and its resumable cache.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import platform
import re
import sys
from datetime import datetime, timezone

APP = Path(__file__).resolve().parents[1]
OUTPUT = APP / 'public' / 'audio' / 'voices'
DATA = APP / 'public' / 'data' / 'grammar.json'
MANIFEST = OUTPUT / 'manifest.json'

spec = importlib.util.spec_from_file_location('voice_samples', Path(__file__).with_name('generate_voice_samples.py'))
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)


def load_json(path: Path):
    # Malformed existing data is an error, never an empty pack to overwrite.
    return json.loads(path.read_text(encoding='utf-8-sig'))


def plan_for(entry_id: str, example_index: int, speaker_id: str, entries: dict) -> dict:
    if not isinstance(entry_id, str) or not re.fullmatch(r'N[2345]-\d{3}', entry_id):
        raise ValueError('语法编号格式错误。')
    entry = entries.get(entry_id)
    if not entry or len(entry.get('examples', [])) != 2 or type(example_index) is not int or example_index not in (0, 1):
        raise ValueError(f'{entry_id}: 原教材例句/索引缺失或错误。')
    speakers = {item['id']: item for item in voice.VOICES}
    if speaker_id not in speakers:
        raise ValueError(f'{entry_id}: 非预设日语声音。')
    speaker = speakers[speaker_id]
    example = entry['examples'][example_index]
    text = example['japanese']
    unannotated = re.sub(r'[（(][ぁ-ゖァ-ヺー]+[）)]', '', example['japanese_annotated'])
    if not text.strip() or text != unannotated or re.search(r'[（(][ぁ-ゖァ-ヺー]+[）)]', text):
        raise ValueError(f'{entry_id}-{example_index + 1}: 原句与显示稿不一致，需人工核对。')
    signature = hashlib.sha256(json.dumps([text, speaker['voice'], voice.RATE], ensure_ascii=False).encode('utf-8')).hexdigest()
    stem = f'{entry_id}-{example_index + 1}'
    return {
        'entryId': entry_id, 'exampleIndex': example_index, 'text': text,
        'voice': speaker_id, 'serviceVoice': speaker['voice'],
        'pdfPage': entry['pdf_page'], 'signature': signature,
        'src': f'/audio/voices/{speaker_id}/{stem}.mp3',
        'srt': f'/audio/voices/{speaker_id}/{stem}.srt',
    }


def clip_key(clip: dict) -> tuple:
    return clip['voice'], clip['entryId'], clip['exampleIndex']


def validate_manifest(value: dict, entries: dict, refreshing: set | None = None) -> list[tuple[dict, dict]]:
    if not isinstance(value, dict) or value.get('version') != 1 or not isinstance(value.get('clips'), list):
        raise ValueError('音频清单格式错误。')
    if value.get('listened') is not False:
        raise ValueError('清单试听标记必须为false；自动验证不代表试听。')
    speakers = value.get('voices')
    if not isinstance(speakers, list) or any(item not in voice.VOICES for item in speakers):
        raise ValueError('清单声音与已配置日语声音不一致。')
    speaker_ids = [item['id'] for item in speakers]
    if len(set(speaker_ids)) != len(speaker_ids):
        raise ValueError('清单声音重复。')
    seen, result = set(), []
    for clip in value['clips']:
        if not isinstance(clip, dict):
            raise ValueError('清单片段格式错误。')
        plan = plan_for(clip.get('entryId'), clip.get('exampleIndex'), clip.get('voice'), entries)
        identity = clip_key(plan)
        if identity in seen or plan['voice'] not in speaker_ids:
            raise ValueError('清单片段重复或声音未声明。')
        seen.add(identity)
        for key in ('entryId', 'exampleIndex', 'text', 'voice', 'src', 'pdfPage', 'srt'):
            if refreshing and identity in refreshing and key in ('text', 'pdfPage'):
                continue
            if clip.get(key) != plan[key]:
                raise ValueError(f'{plan["entryId"]}: 清单字段{key}与原教材/规范路径不一致。')
        result.append((clip, plan))
    return result


def merge_clip(value: dict, clip: dict) -> dict:
    # Preserve metadata and unrelated clips in their existing order.
    clips = list(value['clips'])
    key = clip_key(clip)
    for index, existing in enumerate(clips):
        if clip_key(existing) == key:
            clips[index] = {**existing, **clip}
            break
    else:
        clips.append(clip)
    speakers = list(value['voices'])
    if not any(item['id'] == clip['voice'] for item in speakers):
        speakers.append(next(item for item in voice.VOICES if item['id'] == clip['voice']))
    count = len({item['entryId'] for item in clips})
    return {**value, 'clips': clips, 'voices': speakers, 'listened': False,
            'scope': f'{count}条语法、{len(clips)}个日语例句语音；内容以clips清单为准。仅日语常速合成音频；未试听；非完整讲解版。'}


def verify_manifest(value: dict, entries: dict, ffmpeg: str) -> tuple[list[dict], list[dict]]:
    results, failures = [], []
    pairs = validate_manifest(value, entries)
    if not pairs:
        raise ValueError('没有可验收的音频片段。')
    for index, (clip, plan) in enumerate(pairs, 1):
        label = f'{plan["voice"]}/{plan["entryId"]}-{plan["exampleIndex"] + 1}'
        try:
            measured = voice.verify_clip(plan, ffmpeg)
            if clip.get('durationSeconds') != measured['durationSeconds']:
                raise ValueError('清单时长与解码结果不一致。')
            results.append({**clip, **measured, 'signature': plan['signature'], 'status': 'passed', 'listened': False})
            print(f'[{index}/{len(pairs)}] {label}: 通过', flush=True)
        except (OSError, ValueError) as error:
            failures.append({'clip': label, 'error': voice.safe_error(error)})
            print(f'[{index}/{len(pairs)}] {label}: 失败，{voice.safe_error(error)}', flush=True)
    return results, failures


def report(value: dict, results: list[dict], failures: list[dict], mode: str) -> None:
    summary = {
        'checkedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'mode': mode, 'python': platform.python_version(), 'platform': platform.system(),
        'dependencies': {name: importlib.metadata.version(name) for name in ('edge-tts', 'imageio-ffmpeg')},
        'rate': voice.RATE, 'plannedClips': len(value['clips']), 'passedClips': len(results),
        'failures': failures, 'scope': value.get('scope', ''), 'listened': False, 'clips': results,
        'reviewNotes': ['N2-001-2「十分寝た…」书中读音为じゅうぶん；保留原文，合成读音待实际试听。'],
    }
    voice.write_json(OUTPUT / 'verification.json', summary)
    voice.atomic_text(APP / 'docs-voice-pack-verification.md', f'''# 已安装自然语音包验收

检查时间：{summary['checkedAt']}（UTC）；模式：{mode}。

通过 {len(results)}/{len(value['clips'])}；失败 {len(failures)}。**未试听。**

清单中的每个片段都根据当前教材原句重新构造签名，并验证 MP3 完整解码、时长、非静音、SHA-256、原文、页码、声音及 SRT 起止时间。SRT 为整句单段，不是逐字对齐。解码成功不能证明读音、重音和语调正确；N2-001-2「十分」需核对是否读作じゅうぶん。

默认只离线验收：`python scripts/generate_voice_pack.py`。显式添加条目：`python scripts/generate_voice_pack.py --entries N3-001 N3-002`；不接受全书通配符，保留已有清单与音频。联网采用既有 edge-tts、顺序请求、缓存和有限重试；无新增付费服务。

详见 `public/audio/voices/verification.json`。
''')


async def run(args: argparse.Namespace) -> int:
    data = load_json(DATA)
    entries = {entry['id']: entry for entry in data['entries']}
    value = load_json(MANIFEST) if MANIFEST.exists() else {'version': 1, 'voices': voice.VOICES, 'clips': [], 'listened': False}
    ffmpeg = voice.ffmpeg_binary()
    generation_failures = []
    if args.entries:
        ids = [item for group in args.entries for item in group.split(',')]
        if not ids or len(set(ids)) != len(ids):
            raise ValueError('条目列表不能为空或重复。')
        planned = [plan_for(entry_id, index, speaker['id'], entries)
                   for speaker in voice.VOICES for entry_id in ids for index in (0, 1)]
        selected = {clip_key(plan) for plan in planned}
        pairs = validate_manifest(value, entries, refreshing=selected)
        # Refuse to publish a merged pack when an unrelated existing clip is broken.
        for clip, plan in pairs:
            if clip_key(plan) not in selected:
                measured = voice.verify_clip(plan, ffmpeg)
                if clip.get('durationSeconds') != measured['durationSeconds']:
                    raise ValueError('已有片段的清单时长错误；停止合并。')
        engine = None
        for index, plan in enumerate(planned, 1):
            label = f'{plan["voice"]}/{plan["entryId"]}-{plan["exampleIndex"] + 1}'
            try:
                try:
                    measured = voice.verify_clip(plan, ffmpeg)
                except (OSError, ValueError):
                    if engine is None:
                        import edge_tts
                        listed = await asyncio.wait_for(edge_tts.list_voices(), timeout=50)
                        available = {item['ShortName']: item for item in listed}
                        for speaker in voice.VOICES:
                            if available.get(speaker['voice'], {}).get('Locale') != 'ja-JP':
                                raise ValueError('指定日语声音不可用，不代用其他语言。')
                        engine = edge_tts
                    measured = await voice.synthesize(plan, ffmpeg, args.retries, engine)
                value = merge_clip(value, voice.public_clip(plan, measured))
                voice.write_json(MANIFEST, value)
                print(f'生成/缓存 [{index}/{len(planned)}] {label}: 通过并合并', flush=True)
            except Exception as error:
                generation_failures.append({'clip': label, 'error': voice.safe_error(error)})
                print(f'生成 [{index}/{len(planned)}] {label}: 失败，{voice.safe_error(error)}', flush=True)
    results, failures = verify_manifest(value, entries, ffmpeg)
    failures.extend(generation_failures)
    report(value, results, failures, 'generation-and-verification' if args.entries else 'offline-verification')
    print(f'清单验收：{len(results)}/{len(value["clips"])}；失败 {len(failures)}。未试听。', flush=True)
    return 1 if failures else 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    mode = result.add_mutually_exclusive_group()
    mode.add_argument('--verify-only', action='store_true', help='默认模式：离线核对当前整个音频清单。')
    mode.add_argument('--entries', nargs='+', help='明确列出已获准合成的语法编号；不接受ALL或范围通配符。')
    result.add_argument('--retries', type=int, default=2, choices=range(0, 6))
    return result


if __name__ == '__main__':
    try:
        raise SystemExit(asyncio.run(run(parser().parse_args())))
    except KeyboardInterrupt:
        print('已中止；已完成片段及完整合并清单保留，可续作。', file=sys.stderr)
        raise SystemExit(130)
    except Exception as error:
        print('未完成：' + voice.safe_error(error), file=sys.stderr)
        raise SystemExit(1)
