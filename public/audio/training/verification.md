# 原创听力音频验收

检查时间（UTC）：2026-09-25T05:54:12+00:00。模式：offline-verification。

四道原创N2备考听力练习，含一道N3过渡训练；Nanami日语女声常速独白。合成音频，非真人录音；未试听。

**通过 4/4；失败或未完成 0。未试听。**

- 文本严格等于 listening-drafts.json 中的 transcript，不读题干、选项与中文解析；稿件为原创，非JLPT真题。
- 使用已有 edge-tts 服务 ja-JP-NanamiNeural；读取实际声音列表，顺序请求、0.4秒间隔、最多2次额外重试，成功片段经验证作缓存。
- 完整解码MP3并验证时长0.2～60秒、非静音、SHA-256和文本签名。每份SRT为单个完整独白字幕段，时间0至实际解码时长；不是逐字字幕。
- 配置：Python 3.13.12 / Windows，edge-tts 7.2.8，imageio-ffmpeg 0.6.0，ffmpeg version 7.1-essentials_build-www.gyan.dev Copyright (c) 2000-2024 the FFmpeg developers。
- 未实际试听，解码检查不能保证重音、语调、读音或JLPT语速难度；不要标为真人录音或官方试题。

| ID | 秒 | 字节 | 结果 |
|---|---:|---:|---|
| n2-listening-001 | 32.448 | 194,688 | 通过；未试听 |
| n2-listening-002 | 30.864 | 185,184 | 通过；未试听 |
| n2-listening-003 | 30.024 | 180,144 | 通过；未试听 |
| n2-listening-004 | 29.328 | 175,968 | 通过；未试听 |

## 失败或未完成

无。

## 复现

```powershell
.venv/Scripts/python.exe tmp/learning-upgrade/generate_listening_audio.py
.venv/Scripts/python.exe tmp/learning-upgrade/generate_listening_audio.py --verify-only
```

请在语法音频生成器结束后运行，避免并行请求。整合时将四组同名MP3/SRT/JSON放到应用public/audio/training，manifest.json已使用对应公开相对URL。
