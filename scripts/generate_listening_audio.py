#!/usr/bin/env python3
"""Verify original listening audio offline by default; --generate enables synthesis.

Reads public/data/n2-questions.json (an array or {questions: [...]}) and only the
transcript of category=listening questions. Never reads prompts or answer options.
Reuses the existing sequential edge-tts generator and resumable clip verification.
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
DATA = APP / 'public' / 'data' / 'n2-questions.json'
OUTPUT = APP / 'public' / 'audio' / 'training'
MANIFEST = OUTPUT / 'manifest.json'
SCOPE = '原创N2备考听力练习，含N3过渡训练；Nanami日语女声常速独白。合成音频，非真人录音；未试听。'

spec = importlib.util.spec_from_file_location('voice_samples', Path(__file__).with_name('generate_voice_samples.py'))
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)
voice.OUTPUT = OUTPUT


def clip_paths(plan: dict):
    stem = OUTPUT / plan['entryId']
    return stem.with_suffix('.mp3'), stem.with_suffix('.srt'), stem.with_suffix('.json')


voice.clip_paths = clip_paths


def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def plans() -> list[dict]:
    data = load_json(DATA)
    questions = data if isinstance(data, list) else data.get('questions') if isinstance(data, dict) else None
    if not isinstance(questions, list):
        raise ValueError('题库必须为数组，或包含questions数组。')
    drafts = [question for question in questions if question.get('category') == 'listening']
    if not drafts:
        raise ValueError('题库没有听力练习；不生成空清单。')
    result, seen = [], set()
    speaker = voice.VOICES[0]
    for draft in drafts:
        item_id, text = draft.get('id'), draft.get('transcript')
        if not isinstance(item_id, str) or not re.fullmatch(r'n2-listening-\d{3}', item_id) or item_id in seen:
            raise ValueError('听力题编号错误或重复。')
        seen.add(item_id)
        if not isinstance(text, str) or not text.strip() or len(text) > 240 or re.search(r'[（(][ぁ-ゖァ-ヺー]+[）)]', text):
            raise ValueError(f'{item_id}: 稿件缺失、过长或含注音括号；须先校对。')
        signature = hashlib.sha256(json.dumps([text, speaker['voice'], voice.RATE], ensure_ascii=False).encode('utf-8')).hexdigest()
        src = f'/audio/training/{item_id}.mp3'
        if 'audioSrc' in draft and draft['audioSrc'] != src:
            raise ValueError(f'{item_id}: 题库audioSrc与输出路径不一致。')
        result.append({
            'entryId': item_id, 'exampleIndex': 0, 'text': text,
            'voice': speaker['id'], 'serviceVoice': speaker['voice'],
            'pdfPage': None, 'signature': signature, 'src': src,
            'srt': f'/audio/training/{item_id}.srt',
        })
    return result


def validate_manifest(value: dict, planned: list[dict], refreshing: bool = False) -> dict:
    if (not isinstance(value, dict) or value.get('version') != 1 or not isinstance(value.get('clips'), list)
            or value.get('listened') is not False or value.get('synthetic') is not True
            or value.get('voices') != [voice.VOICES[0]]):
        raise ValueError('听力清单格式/合成音频/试听标记错误。')
    by_id = {plan['entryId']: plan for plan in planned}
    indexed = {}
    for clip in value['clips']:
        item_id = clip.get('entryId') if isinstance(clip, dict) else None
        if item_id not in by_id or item_id in indexed:
            raise ValueError('清单存在重复或当前题库之外的听力编号；不会自动删除。')
        plan = by_id[item_id]
        for key in ('entryId', 'exampleIndex', 'text', 'voice', 'src', 'pdfPage', 'srt'):
            if refreshing and key == 'text':
                continue
            if clip.get(key) != plan[key]:
                raise ValueError(f'{item_id}: 清单字段{key}与题库或输出路径不一致。')
        indexed[item_id] = clip
    return indexed


def merge_clip(value: dict, clip: dict) -> dict:
    clips = list(value['clips'])
    for index, existing in enumerate(clips):
        if existing['entryId'] == clip['entryId']:
            clips[index] = {**existing, **clip}
            break
    else:
        clips.append(clip)
    return {**value, 'clips': clips, 'scope': SCOPE, 'synthetic': True, 'listened': False}


def verify_manifest(value: dict, planned: list[dict], ffmpeg: str):
    indexed = validate_manifest(value, planned)
    results, failures = [], []
    for index, plan in enumerate(planned, 1):
        try:
            clip = indexed.get(plan['entryId'])
            if clip is None:
                raise ValueError('清单缺少这道题的听力音频。')
            measured = voice.verify_clip(plan, ffmpeg)
            if clip.get('durationSeconds') != measured['durationSeconds']:
                raise ValueError('清单时长与解码时长不一致。')
            metadata = load_json(clip_paths(plan)[2])
            if metadata.get('synthetic') is not True or metadata.get('source') != 'original-listening-exercise':
                raise ValueError('片段缺少原创合成音频标记。')
            results.append({**clip, **measured, 'signature': plan['signature'], 'status': 'passed', 'synthetic': True, 'listened': False})
            print(f'[{index}/{len(planned)}] {plan["entryId"]}: 通过，{measured["durationSeconds"]:.3f}秒', flush=True)
        except (OSError, ValueError) as error:
            failures.append({'clip': plan['entryId'], 'error': voice.safe_error(error)})
            print(f'[{index}/{len(planned)}] {plan["entryId"]}: 失败，{voice.safe_error(error)}', flush=True)
    return results, failures


def report(planned: list[dict], results: list[dict], failures: list[dict], mode: str):
    summary = {
        'checkedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'mode': mode, 'python': platform.python_version(), 'platform': platform.system(),
        'dependencies': {name: importlib.metadata.version(name) for name in ('edge-tts', 'imageio-ffmpeg')},
        'rate': voice.RATE, 'plannedClips': len(planned), 'passedClips': len(results),
        'failures': failures, 'scope': SCOPE, 'synthetic': True, 'listened': False, 'clips': results,
    }
    voice.write_json(OUTPUT / 'verification.json', summary)
    voice.atomic_text(APP / 'docs-listening-audio-verification.md', f'''# 原创听力音频验收

检查时间：{summary['checkedAt']}（UTC）；模式：{mode}。

通过 {len(results)}/{len(planned)}；失败 {len(failures)}。**合成音频，非真人录音；未试听。**

输入严格取题库中听力题的transcript，绝不朗读题干、选项与解析。验证完整解码、时长、非静音、SHA-256、题目编号、文本签名、字幕内容及时间。SRT是单个完整独白字幕段，不是逐字对齐。读音、重音、语调和难度尚不能由自动验证确认；原创练习不是JLPT官方真题。

默认只离线验证：`python scripts/generate_listening_audio.py`。显式生成：`python scripts/generate_listening_audio.py --generate`。采用已有edge-tts服务、顺序请求、缓存与有限重试；保留合成音频及未试听标记。

详见 `public/audio/training/verification.json`。
''')


async def run(args: argparse.Namespace) -> int:
    planned = plans()
    value = load_json(MANIFEST) if MANIFEST.exists() else {
        'version': 1, 'voices': [voice.VOICES[0]], 'clips': [], 'scope': SCOPE, 'synthetic': True, 'listened': False,
    }
    validate_manifest(value, planned, refreshing=args.generate)
    ffmpeg = voice.ffmpeg_binary()
    generation_failures = []
    if args.generate:
        engine = None
        for index, plan in enumerate(planned, 1):
            try:
                try:
                    measured = voice.verify_clip(plan, ffmpeg)
                except (OSError, ValueError):
                    if engine is None:
                        import edge_tts
                        listed = await asyncio.wait_for(edge_tts.list_voices(), timeout=50)
                        if not any(item.get('ShortName') == plan['serviceVoice'] and item.get('Locale') == 'ja-JP' for item in listed):
                            raise ValueError('指定日语声音不可用，不代用其他语言。')
                        engine = edge_tts
                    measured = await voice.synthesize(plan, ffmpeg, args.retries, engine)
                metadata_path = clip_paths(plan)[2]
                voice.write_json(metadata_path, load_json(metadata_path) | {'synthetic': True, 'source': 'original-listening-exercise'})
                value = merge_clip(value, voice.public_clip(plan, measured))
                voice.write_json(MANIFEST, value)
                print(f'生成/缓存 [{index}/{len(planned)}] {plan["entryId"]}: 通过并合并', flush=True)
            except Exception as error:
                generation_failures.append({'clip': plan['entryId'], 'error': voice.safe_error(error)})
                print(f'生成 {plan["entryId"]}: 失败，{voice.safe_error(error)}', flush=True)
    results, failures = verify_manifest(value, planned, ffmpeg)
    failures.extend(generation_failures)
    report(planned, results, failures, 'generation-and-verification' if args.generate else 'offline-verification')
    print(f'清单验收：{len(results)}/{len(planned)}；失败 {len(failures)}。未试听。', flush=True)
    return 1 if failures else 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    mode = result.add_mutually_exclusive_group()
    mode.add_argument('--verify-only', action='store_true', help='默认：只离线验证已安装的听力音频。')
    mode.add_argument('--generate', action='store_true', help='明确允许为当前题库听力稿联网合成。')
    result.add_argument('--retries', type=int, default=2, choices=range(0, 6))
    return result


if __name__ == '__main__':
    try:
        raise SystemExit(asyncio.run(run(parser().parse_args())))
    except KeyboardInterrupt:
        print('已中止；完成的片段和合并清单保留，可续作。', file=sys.stderr)
        raise SystemExit(130)
    except Exception as error:
        print('未完成：' + voice.safe_error(error), file=sys.stderr)
        raise SystemExit(1)
