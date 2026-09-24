#!/usr/bin/env python3
"""Generate book-aligned example-practice MP3s. Python 3.10+.

This package contains text and a generator, not prerecorded audio.
Online synthesis has NOT been successfully tested in the authoring environment.
Run --dry-run without any external dependencies to inspect the playlist first.
"""
from __future__ import annotations
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass

ROOT = Path(__file__).resolve().parent
SAMPLE_RATE = 24000

@dataclass(frozen=True)
class Segment:
    text: str = ''
    lang: str = 'ja'
    rate: str = '+0%'
    subtitle: str = ''
    silence: float = 0.0


def load_entries(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding='utf-8'))
    entries = data['entries']
    if len(entries) != 622 or len({e['id'] for e in entries}) != 622:
        raise ValueError('数据校验失败：应有622个唯一条目。')
    for e in entries:
        if len(e.get('examples', [])) != 2:
            raise ValueError(f"{e['id']} 的例句数不是2。")
        for x in e['examples']:
            for key in ('japanese', 'japanese_annotated', 'japanese_reading', 'chinese'):
                if not isinstance(x.get(key), str) or not x[key].strip():
                    raise ValueError(f"{e['id']} 的 {key} 缺失。")
    return entries


def make_segments(entry: dict, args: argparse.Namespace) -> list[Segment]:
    result: list[Segment] = []
    number = int(entry['id'].split('-')[1])
    if not args.no_chinese:
        intro = f"{entry['level'][1]}级，第{number}条。对应语法书第{entry['pdf_page']}页。"
        result.append(Segment(intro, 'zh', subtitle=f"{entry['id']} · 第{entry['pdf_page']}页\n{entry['title']}"))
        result.append(Segment(silence=0.6))
    for i, x in enumerate(entry['examples'], 1):
        jp = x['japanese_reading'] if args.use_readings else x['japanese']
        label = f"{entry['id']} · 例句{i}"
        sub = f"{label}\n{x['japanese_annotated']}\n{x['chinese']}"
        result.append(Segment(jp, 'ja', '+0%', sub))
        result.append(Segment(silence=0.6))
        if not args.no_chinese:
            result.append(Segment(x['chinese'], 'zh', subtitle=x['chinese']))
            result.append(Segment(silence=0.6))
        if args.mode == 'study':
            result.append(Segment(jp, 'ja', '-22%', sub + '\n〔慢读〕'))
        if args.gap > 0:
            result.append(Segment(silence=args.gap))
        if args.mode == 'study':
            result.append(Segment(jp, 'ja', '+0%', sub))
            result.append(Segment(silence=0.9))
    return result


def srt_time(seconds: float) -> str:
    ms = round(seconds * 1000)
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'


def run_ffmpeg(ffmpeg: str, arguments: list[str]) -> None:
    done = subprocess.run([ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', *arguments],
                          capture_output=True, timeout=180)
    if done.returncode:
        raise RuntimeError('FFmpeg处理失败：' + done.stderr.decode('utf-8', errors='replace')[-1800:])


def find_ffmpeg() -> str:
    binary = shutil.which('ffmpeg')
    if binary:
        return binary
    try:
        import imageio_ffmpeg
        binary = imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError) as exc:
        raise RuntimeError('找不到FFmpeg。请运行 python -m pip install -r requirements.txt') from exc
    return binary


def valid_wave(path: Path) -> bool:
    try:
        with wave.open(str(path), 'rb') as w:
            return (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, SAMPLE_RATE) and w.getnframes() > 0
    except (OSError, wave.Error, EOFError):
        return False


def choose_voice(voices: list[dict], language: str, requested: str) -> str:
    names = {v['ShortName']: v for v in voices}
    if requested != 'auto':
        if requested not in names:
            raise ValueError(f'所选声音不存在：{requested}。请用 --list-voices 查看。')
        if not names[requested].get('Locale', '').lower().startswith(language):
            raise ValueError(f'{requested} 不是所需的 {language} 语言声音。')
        return requested
    preferred = 'ja-JP-NanamiNeural' if language == 'ja' else 'zh-CN-XiaoxiaoNeural'
    if preferred in names:
        return preferred
    locale = 'ja-JP' if language == 'ja' else 'zh-CN'
    options = [v for v in voices if v.get('Locale') == locale]
    if not options:
        raise RuntimeError(f'在线服务没有返回 {locale} 声音。停止生成，不使用其他语言代替。')
    options.sort(key=lambda v: (v.get('Gender') != 'Female', v['ShortName']))
    return options[0]['ShortName']


async def synthesize(segment: Segment, voice: str, cache: Path, ffmpeg: str, edge_tts, retries: int) -> Path:
    digest = hashlib.sha256(json.dumps([segment.text, voice, segment.rate], ensure_ascii=False).encode()).hexdigest()
    target = cache / f'{digest}.wav'
    if valid_wave(target):
        return target
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with tempfile.TemporaryDirectory(prefix='tts-', dir=cache) as td:
                mp3 = Path(td) / 'part.mp3'
                wav = Path(td) / 'part.wav'
                request = edge_tts.Communicate(text=segment.text, voice=voice, rate=segment.rate)
                await asyncio.wait_for(request.save(str(mp3)), timeout=65)
                if not mp3.exists() or mp3.stat().st_size < 300:
                    raise RuntimeError('语音服务没有返回有效音频。')
                run_ffmpeg(ffmpeg, ['-i', str(mp3), '-ac', '1', '-ar', str(SAMPLE_RATE), '-c:a', 'pcm_s16le', str(wav)])
                if not valid_wave(wav):
                    raise RuntimeError('音频解码或采样格式校验失败。')
                os.replace(wav, target)
            await asyncio.sleep(0.4)  # Sequential requests; avoid aggressive parallel traffic.
            return target
        except Exception as exc:
            last_error = exc
            if attempt < retries:
                print(f'  合成未成功，第{attempt + 1}次重试：{exc}', flush=True)
                await asyncio.sleep(2 ** (attempt + 1))
    raise RuntimeError(f'语音合成失败，已保留成功片段，可稍后重试。原因：{last_error}') from last_error


def assemble(paths: list[Path | None], segments: list[Segment], output_wav: Path) -> tuple[float, str]:
    """Join mono PCM clips and exact silent intervals; create segment-level subtitles."""
    frames = 0
    subtitles = []
    with wave.open(str(output_wav), 'wb') as dst:
        dst.setnchannels(1)
        dst.setsampwidth(2)
        dst.setframerate(SAMPLE_RATE)
        for path, seg in zip(paths, segments, strict=True):
            if seg.silence > 0:
                count = round(seg.silence * SAMPLE_RATE)
                dst.writeframes(b'\x00\x00' * count)
                frames += count
                continue
            if path is None:
                raise ValueError('语音片段路径缺失。')
            with wave.open(str(path), 'rb') as clip:
                if (clip.getnchannels(), clip.getsampwidth(), clip.getframerate()) != (1, 2, SAMPLE_RATE):
                    raise ValueError(f'片段格式不一致：{path}')
                count = clip.getnframes()
                start = frames / SAMPLE_RATE
                dst.writeframes(clip.readframes(count))
                frames += count
                if seg.subtitle:
                    subtitles.append(f'{len(subtitles)+1}\n{srt_time(start)} --> {srt_time(frames/SAMPLE_RATE)}\n{seg.subtitle}\n')
    return frames / SAMPLE_RATE, '\n'.join(subtitles)


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='N5–N2配套例句MP3生成器。默认只生成N5前3条。')
    parser.add_argument('--data', type=Path, default=ROOT / 'grammar_data.json')
    parser.add_argument('--level', choices=['N5', 'N4', 'N3', 'N2', 'ALL'], default='N5')
    parser.add_argument('--start', type=int, default=1, help='各级内起始编号，含本条')
    parser.add_argument('--end', type=int, default=3, help='各级内结束编号，含本条；默认3')
    parser.add_argument('--all-entries', action='store_true', help='选中所选级别的全部条目，忽略start/end')
    parser.add_argument('--mode', choices=['study', 'review'], default='study')
    parser.add_argument('--no-chinese', action='store_true', help='仅日语，不朗读中文译文或编号提示')
    parser.add_argument('--use-readings', action='store_true', help='按书中假名送读，可能改变语调')
    parser.add_argument('--ja-voice', default='auto')
    parser.add_argument('--zh-voice', default='auto')
    parser.add_argument('--gap', type=float, default=4.0, help='跟读留白秒数（0到30）')
    parser.add_argument('--output', type=Path, default=ROOT / 'audio_output')
    parser.add_argument('--retries', type=int, default=2, help='每片段失败后的额外重试次数（0到5）')
    parser.add_argument('--overwrite', action='store_true')
    parser.add_argument('--dry-run', action='store_true', help='只输出朗读脚本，不联网，不生成音频')
    parser.add_argument('--list-voices', action='store_true', help='联网列出中日文声音，然后退出')
    args = parser.parse_args()
    if not 0 <= args.gap <= 30 or not 0 <= args.retries <= 5:
        parser.error('gap应在0到30之间，retries应在0到5之间。')
    if not args.all_entries and (args.start < 1 or args.end < args.start):
        parser.error('起始编号至少为1，结束编号不能小于起始编号。')
    return args


async def main(args: argparse.Namespace) -> int:
    entries = load_entries(args.data)
    selected = [e for e in entries if (args.level == 'ALL' or e['level'] == args.level)
                and (args.all_entries or args.start <= int(e['id'].split('-')[1]) <= args.end)]
    if not selected:
        raise ValueError('指定范围没有条目。')
    plans = [(e, make_segments(e, args)) for e in selected]
    if args.dry_run:
        args.output.mkdir(parents=True, exist_ok=True)
        path = args.output / f'playlist_{args.level}_{args.mode}.json'
        path.write_text(json.dumps([{'id': e['id'], 'title': e['title'], 'pdf_page': e['pdf_page'],
                                    'segments': [vars(s) for s in segs]} for e, segs in plans], ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'已校验：{len(selected)}条，{len(selected)*2}个例句。\n朗读脚本：{path}\n未联网，未生成音频。')
        return 0
    try:
        import edge_tts
    except ImportError as exc:
        raise RuntimeError('缺少edge-tts。先运行：python -m pip install -r requirements.txt') from exc
    print('正在联网读取可用声音…', flush=True)
    try:
        voices = await asyncio.wait_for(edge_tts.list_voices(), timeout=50)
    except Exception as exc:
        raise RuntimeError('无法连接在线语音服务。请检查网络和服务可用性；尚未生成新音频。' + str(exc)) from exc
    if args.list_voices:
        for v in voices:
            if v.get('Locale', '').startswith(('ja', 'zh')):
                print(v['ShortName'], v.get('Gender', ''), v.get('Locale', ''))
        return 0
    ja = choose_voice(voices, 'ja', args.ja_voice)
    zh = '' if args.no_chinese else choose_voice(voices, 'zh', args.zh_voice)
    ffmpeg = find_ffmpeg()
    print(f'日语：{ja}\n中文：{zh or "不朗读"}\n目标：{len(plans)}条，每条一个MP3。', flush=True)
    suffix = args.mode + ('_ja_only' if args.no_chinese else '_bilingual') + ('_readings' if args.use_readings else '')
    root = args.output / suffix
    cache = args.output / '_clip_cache'
    cache.mkdir(parents=True, exist_ok=True)
    completed = 0
    for entry, segments in plans:
        dest = root / entry['level']
        dest.mkdir(parents=True, exist_ok=True)
        mp3 = dest / f"{entry['id']}.mp3"
        sub = dest / f"{entry['id']}.srt"
        meta = dest / f"{entry['id']}.json"
        signature = hashlib.sha256(json.dumps({'segments': [vars(s) for s in segments], 'ja': ja, 'zh': zh}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        previous = {}
        try:
            previous = json.loads(meta.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            pass
        if (not args.overwrite and mp3.exists() and mp3.stat().st_size > 300 and sub.exists()
                and previous.get('signature') == signature):
            completed += 1
            print(f'[{completed}/{len(plans)}] 已有同配置文件，跳过 {entry["id"]}', flush=True)
            continue
        print(f'[{completed+1}/{len(plans)}] 正在生成 {entry["id"]} · P.{entry["pdf_page"]}', flush=True)
        paths = []
        for seg in segments:
            paths.append(None if seg.silence > 0 else await synthesize(seg, ja if seg.lang == 'ja' else zh, cache, ffmpeg, edge_tts, args.retries))
        with tempfile.TemporaryDirectory(prefix='track-', dir=dest) as td:
            wav, temporary_mp3 = Path(td) / 'track.wav', Path(td) / 'track.mp3'
            duration, srt = assemble(paths, segments, wav)
            run_ffmpeg(ffmpeg, ['-i', str(wav), '-c:a', 'libmp3lame', '-b:a', '96k',
                               '-metadata', f"title={entry['id']} {entry['title']}",
                               '-metadata', 'album=N5-N2 Grammar Example Practice', str(temporary_mp3)])
            if not temporary_mp3.exists() or temporary_mp3.stat().st_size < 300:
                raise RuntimeError('MP3编码失败。')
            os.replace(temporary_mp3, mp3)
        sub.write_text(srt, encoding='utf-8-sig')
        meta.write_text(json.dumps({'id': entry['id'], 'title': entry['title'], 'pdf_page': entry['pdf_page'],
                                   'duration_seconds': round(duration, 3), 'ja_voice': ja, 'zh_voice': zh,
                                   'signature': signature, 'scope': '例句跟读，不含完整语法讲解'}, ensure_ascii=False, indent=2), encoding='utf-8')
        completed += 1
        print(f'  完成 {mp3.name} · {duration:.1f}秒', flush=True)
    print(f'本次完成或确认已有 {completed}/{len(plans)} 条。输出位置：{root}\n请先试听检查读音，再用于长期跟读。')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(asyncio.run(main(get_args())))
    except KeyboardInterrupt:
        print('\n已中止，成功合成的片段已缓存。稍后运行同一命令可续作。', file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f'\n未完成：{exc}', file=sys.stderr)
        raise SystemExit(1)
