#!/usr/bin/env python3
"""Generate only 24 Japanese voice comparison clips, or verify them offline.

Python 3.10+. Install legacy/requirements.txt in a project virtual environment.
Run: python scripts/generate_voice_samples.py [--verify-only] [--retries 2]

Uses the existing edge-tts service with normal TLS verification. Requests are
sequential. Successfully decoded MP3/SRT/JSON triplets are the resumable cache.
This script never generates the whole book and never claims listening review.
"""
from __future__ import annotations

import argparse
import array
import asyncio
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

APP = Path(__file__).resolve().parents[1]
OUTPUT = APP / 'public' / 'audio' / 'voices'
DATA = APP / 'public' / 'data' / 'grammar.json'
REPORT = APP / 'docs-voice-samples-verification.md'
ENTRY_IDS = ('N5-001', 'N5-002', 'N5-003', 'N4-001', 'N4-002', 'N4-003')
VOICES = [
    {'id': 'nanami', 'label': 'Nanami · 日语女声', 'voice': 'ja-JP-NanamiNeural'},
    {'id': 'keita', 'label': 'Keita · 日语男声', 'voice': 'ja-JP-KeitaNeural'},
]
RATE = '+0%'
SAMPLE_RATE = 24000
SCOPE = 'N5-001～003、N4-001～003 的两个原始日语例句；两种声音，常速，仅日语。未试听，非完整讲解版。'


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def atomic_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n',
                                     dir=path.parent, prefix='.pending-', delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(text)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def write_json(path: Path, value: dict) -> None:
    atomic_text(path, json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def safe_error(error: Exception) -> str:
    message = f'{type(error).__name__}: {error}'
    for path, replacement in ((str(APP), '<APP>'), (str(APP.parent), '<PROJECT>'),
                              (str(Path.home()), '<USER>')):
        message = message.replace(path, replacement)
    return re.sub(r'https?://[^\s<>\"\']+', '<service-url>', message)


def plans() -> list[dict]:
    entries = read_json(DATA).get('entries', [])
    by_id = {entry['id']: entry for entry in entries}
    result = []
    for voice in VOICES:
        for entry_id in ENTRY_IDS:
            entry = by_id.get(entry_id)
            if not entry or len(entry.get('examples', [])) != 2:
                raise ValueError(f'{entry_id}: 必须保留原教材的两个例句。')
            for index, example in enumerate(entry['examples']):
                text = example['japanese']
                # Validate annotation removal, without changing particles or readings.
                unannotated = re.sub(r'[（(][ぁ-ゖァ-ヺー]+[）)]', '', example['japanese_annotated'])
                if not text.strip() or text != unannotated or re.search(r'[（(][ぁ-ゖァ-ヺー]+[）)]', text):
                    raise ValueError(f'{entry_id}-{index + 1}: 原句与显示稿不一致，需人工核对。')
                stem = f'{entry_id}-{index + 1}'
                signature = hashlib.sha256(json.dumps(
                    [text, voice['voice'], RATE], ensure_ascii=False,
                ).encode('utf-8')).hexdigest()
                result.append({
                    'entryId': entry_id, 'exampleIndex': index, 'text': text,
                    'voice': voice['id'], 'serviceVoice': voice['voice'],
                    'pdfPage': entry['pdf_page'], 'signature': signature,
                    'src': f'/audio/voices/{voice["id"]}/{stem}.mp3',
                    'srt': f'/audio/voices/{voice["id"]}/{stem}.srt',
                })
    if len(result) != 24:
        raise ValueError('只允许这次确认的 24 个日语片段。')
    return result


def clip_paths(plan: dict) -> tuple[Path, Path, Path]:
    stem = OUTPUT / plan['voice'] / f'{plan["entryId"]}-{plan["exampleIndex"] + 1}'
    return stem.with_suffix('.mp3'), stem.with_suffix('.srt'), stem.with_suffix('.json')


def ffmpeg_binary() -> str:
    existing = shutil.which('ffmpeg')
    if existing:
        return existing
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def decode(path: Path, ffmpeg: str) -> dict:
    if not path.is_file() or path.stat().st_size < 300:
        raise ValueError('MP3 缺失或过小。')
    process = subprocess.run([
        ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', str(path),
        '-ac', '1', '-ar', str(SAMPLE_RATE), '-f', 's16le', 'pipe:1',
    ], capture_output=True, timeout=60)
    if process.returncode:
        raise ValueError(f'MP3 完整解码失败，FFmpeg 退出码 {process.returncode}。')
    pcm = array.array('h', process.stdout)
    if sys.byteorder != 'little':
        pcm.byteswap()
    duration = len(pcm) / SAMPLE_RATE
    if not 0.2 <= duration <= 60:
        raise ValueError(f'例句音频时长异常：{duration:.3f} 秒。')
    peak = max(abs(value) for value in pcm)
    rms = math.sqrt(sum(value * value for value in pcm) / len(pcm))
    if rms <= 1:
        raise ValueError('音频为空或几乎全静音。')
    return {
        'durationSeconds': round(duration, 3), 'bytes': path.stat().st_size,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'peakPcm': peak, 'rmsDbfs': round(20 * math.log10(rms / 32768), 2),
    }


def srt_text(text: str, duration: float) -> str:
    ms = round(duration * 1000)
    seconds, milliseconds = divmod(ms, 1000)
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    end = f'{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}'
    return f'1\n00:00:00,000 --> {end}\n{text}\n'


def verify_clip(plan: dict, ffmpeg: str) -> dict:
    mp3, srt, meta_path = clip_paths(plan)
    metadata = read_json(meta_path)
    for key in ('entryId', 'exampleIndex', 'text', 'voice', 'serviceVoice', 'pdfPage', 'signature'):
        if metadata.get(key) != plan[key]:
            raise ValueError(f'片段元数据 {key} 缺失或与当前教材/声音不一致。')
    if metadata.get('rate') != RATE or metadata.get('listened') is not False:
        raise ValueError('片段速率或试听标记不符合本次范围。')
    measured = decode(mp3, ffmpeg)
    if measured['sha256'] != metadata.get('sha256') or measured['durationSeconds'] != metadata.get('durationSeconds'):
        raise ValueError('音频内容或时长与已验证的元数据不符。')
    if srt.read_text(encoding='utf-8-sig').strip() != srt_text(plan['text'], measured['durationSeconds']).strip():
        raise ValueError('SRT 文本或起止时间与原句/解码时长不符。')
    return measured


async def synthesize(plan: dict, ffmpeg: str, retries: int, edge_tts) -> dict:
    mp3, srt, meta_path = clip_paths(plan)
    mp3.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(retries + 1):
        try:
            with tempfile.TemporaryDirectory(prefix='.tts-', dir=mp3.parent) as directory:
                temporary_mp3 = Path(directory) / 'clip.mp3'
                request = edge_tts.Communicate(text=plan['text'], voice=plan['serviceVoice'], rate=RATE)
                await asyncio.wait_for(request.save(str(temporary_mp3)), timeout=65)
                measured = decode(temporary_mp3, ffmpeg)
                os.replace(temporary_mp3, mp3)
            atomic_text(srt, srt_text(plan['text'], measured['durationSeconds']))
            write_json(meta_path, {**plan, **measured, 'rate': RATE, 'listened': False})
            await asyncio.sleep(0.4)
            return verify_clip(plan, ffmpeg)
        except Exception as error:
            if attempt == retries:
                raise
            print(f'  重试 {attempt + 1}/{retries}：{safe_error(error)}', flush=True)
            await asyncio.sleep(2 ** (attempt + 1))
    raise RuntimeError('未生成片段。')


def public_clip(plan: dict, measured: dict) -> dict:
    return {key: plan[key] for key in (
        'entryId', 'exampleIndex', 'text', 'voice', 'src', 'pdfPage', 'srt',
    )} | {'durationSeconds': measured['durationSeconds']}


def manifest(clips: list[dict]) -> dict:
    return {'version': 1, 'voices': VOICES, 'clips': clips, 'scope': SCOPE, 'listened': False}


def report(results: list[dict], failures: list[dict], ffmpeg: str, mode: str) -> None:
    versions = {name: importlib.metadata.version(name) for name in ('edge-tts', 'imageio-ffmpeg')}
    ffmpeg_version = subprocess.run([ffmpeg, '-version'], capture_output=True, text=True, check=True).stdout.splitlines()[0]
    summary = {
        'checkedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'mode': mode, 'python': platform.python_version(), 'platform': platform.system(),
        'dependencies': versions, 'ffmpeg': ffmpeg_version, 'rate': RATE,
        'plannedClips': 24, 'passedClips': len(results), 'failures': failures,
        'scope': SCOPE, 'listened': False, 'clips': results,
    }
    write_json(OUTPUT / 'verification.json', summary)
    rows = '\n'.join(
        f'| {r["entryId"]}-{r["exampleIndex"] + 1} | {r["voice"]} | {r["pdfPage"]} | {r["durationSeconds"]:.3f} | {r["bytes"]:,} | 通过；未试听 |'
        for r in results
    )
    errors = '\n'.join(f'- {f["clip"]}: {f["error"]}' for f in failures) or '无。'
    atomic_text(REPORT, f'''# 日语音色对比样例验收

检查时间（UTC）：{summary['checkedAt']}。模式：{mode}。

仅生成 N5-001～003、N4-001～003 的两个原始日语例句，每句分别使用 Nanami / Keita，共 24 个目标片段。声音来自已使用的 edge-tts 路线，不包含中文或完整语法讲解。

**本次通过 {len(results)}/24；失败或未完成 {len(failures)}。未试听。** 解码、非静音及字幕检查不能证明重音、语调或读音正确；需用户对比两种声音。未启动全书合成。

## 配置与验证范围

- Python {summary['python']}，{summary['platform']}；edge-tts {versions['edge-tts']}；imageio-ffmpeg {versions['imageio-ffmpeg']}。
- FFmpeg：{ffmpeg_version}。
- 声音：`ja-JP-NanamiNeural` / `ja-JP-KeitaNeural`；速率 `{RATE}`，原始服务 MP3，未额外进行有损转码。
- 合成前实际读取声音列表，要求两种声音存在且 Locale 为 `ja-JP`；保留默认 TLS 校验。
- 输入仅取教材 `japanese`，并与删除括号注音后的 `japanese_annotated` 逐句比对；未改写教材、假名或助词。
- 顺序请求、0.4 秒间隔、失败最多额外重试 2 次（默认）；使用已验证 MP3/SRT/JSON 作缓存，可恢复运行。
- 所有片段完整解码至 24 kHz、单声道、16-bit PCM，核对文件存在、时长、非静音能量、编号/例句索引/页码、声音及输入签名、SHA-256。
- 每份 SRT 只有一个整句字幕段，文本与原句一致，起止时间为 0 至真实解码时长；不是逐字对齐字幕。
- `public/audio/voices/manifest.json` 只列出本次通过验收的片段，`exampleIndex` 从 0 开始，`listened` 为 `false`。

## 文件清单

| 例句 | 声音 | PDF 页码 | 解码时长（秒） | MP3 字节数 | 检查结果 |
|---|---|---:|---:|---:|---|
{rows}

## 失败或未完成

{errors}

## 复现

在项目虚拟环境安装 `legacy/requirements.txt`，从应用目录运行：

```sh
python scripts/generate_voice_samples.py
python scripts/generate_voice_samples.py --verify-only
```

默认范围固定为这 24 个片段，不支持全书选项。离线验收不会查询声音或发起合成。成功片段旁的 JSON 是内容签名与解码验收记录；改动文本/声音/速率或损坏文件会使缓存失效。

详细检查结果与依赖版本见 `public/audio/voices/verification.json`。报告使用相对路径，不记录用户路径、服务请求令牌或密钥。
''')


async def main(args: argparse.Namespace) -> int:
    planned = plans()
    ffmpeg = ffmpeg_binary()
    results, failures, clips = [], [], []
    edge_tts = None
    if not args.verify_only:
        import edge_tts
        print('正在读取实际日语声音列表…', flush=True)
        listed = await asyncio.wait_for(edge_tts.list_voices(), timeout=50)
        available = {voice['ShortName']: voice for voice in listed}
        for voice in VOICES:
            if available.get(voice['voice'], {}).get('Locale') != 'ja-JP':
                raise ValueError(f'未获得指定日语声音：{voice["voice"]}；停止，不使用其他语言代读。')
            print(f'已确认：{voice["voice"]}', flush=True)
    for index, plan in enumerate(planned, 1):
        label = f'{plan["voice"]}/{plan["entryId"]}-{plan["exampleIndex"] + 1}'
        try:
            try:
                measured = verify_clip(plan, ffmpeg)
                state = '缓存验收通过'
            except (OSError, ValueError):
                if args.verify_only:
                    raise
                measured = await synthesize(plan, ffmpeg, args.retries, edge_tts)
                state = '新合成并验收通过'
            clips.append(public_clip(plan, measured))
            results.append({**public_clip(plan, measured), **measured, 'signature': plan['signature'], 'status': 'passed', 'listened': False})
            if not args.verify_only:
                write_json(OUTPUT / 'manifest.json', manifest(clips))
            print(f'[{index}/24] {label}：{state}，{measured["durationSeconds"]:.3f} 秒', flush=True)
        except Exception as error:
            failures.append({'clip': label, 'error': safe_error(error)})
            print(f'[{index}/24] {label}：失败，{safe_error(error)}', flush=True)
    if args.verify_only and read_json(OUTPUT / 'manifest.json') != manifest(clips):
        failures.append({'clip': 'manifest', 'error': '清单与真实通过验收的片段或范围不一致。'})
    report(results, failures, ffmpeg, 'offline-verification' if args.verify_only else 'generation-and-verification')
    print(f'完成：{len(results)}/24，失败或未完成：{len(failures)}。未试听。', flush=True)
    return 1 if failures else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true', help='只离线解码和核对已有片段，不联网。')
    parser.add_argument('--retries', type=int, default=2, choices=range(0, 6))
    try:
        raise SystemExit(asyncio.run(main(parser.parse_args())))
    except KeyboardInterrupt:
        print('已中止；完成的片段与元数据保留，下次运行可续作。', file=sys.stderr)
        raise SystemExit(130)
    except Exception as error:
        print('未完成：' + safe_error(error), file=sys.stderr)
        raise SystemExit(1)
