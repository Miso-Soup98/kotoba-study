# 原创听力音频验收

检查时间：2026-09-25T06:08:01+00:00（UTC）；模式：offline-verification。

通过 4/4；失败 0。**合成音频，非真人录音；未试听。**

输入严格取题库中听力题的transcript，绝不朗读题干、选项与解析。验证完整解码、时长、非静音、SHA-256、题目编号、文本签名、字幕内容及时间。SRT是单个完整独白字幕段，不是逐字对齐。读音、重音、语调和难度尚不能由自动验证确认；原创练习不是JLPT官方真题。

默认只离线验证：`python scripts/generate_listening_audio.py`。显式生成：`python scripts/generate_listening_audio.py --generate`。采用已有edge-tts服务、顺序请求、缓存与有限重试；保留合成音频及未试听标记。

详见 `public/audio/training/verification.json`。
