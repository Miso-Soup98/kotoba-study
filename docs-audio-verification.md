# 本地音频样例验证记录

本报告记录原始教材工作目录中的验收过程。开源应用中的对应文件位于 `public/audio/`，机器可读报告为 `public/audio/sample_verification.json`；以下 `audio_output/` 路径是原始生成器的输出路径。

验证日期：2026-09-24（Asia/Tokyo）。机器可读的验收时间及明细见 `audio_output/sample_verification.json`。

## 本次结果

已有 `edge-tts` 路线在本机成功连接并生成 **N5-001、N5-002、N5-003 三条真实 MP3**，每条都有 SRT 和 JSON 元数据。文件存在性、完整解码、时长、字幕文本与时间、条目/页码对应均通过检查。

**未试听。** 本次检查不能证明日语读音、重音、语调或中文音色正确；仍需用户确认音色、读音及跟读流程。没有启动全书音频合成。样例是例句跟读版，不含完整语法、生词讲解配音。

## 环境与依赖

- 环境：Windows 11，PowerShell 7.6.5；未使用 WSL/Linux。
- Python：3.13.12，使用项目内 `.venv`，依赖未安装到用户的全局/研究环境。
- `edge-tts`：7.2.8。
- `imageio-ffmpeg`：0.6.0。
- 实际用于合成与验收的 FFmpeg：7.1（`essentials_build-www.gyan.dev`）。
- 日语声音：`ja-JP-NanamiNeural`。
- 中文声音：`zh-CN-XiaoxiaoNeural`。
- 保持默认 SSL 校验；未修改网络、防火墙，未使用新的外部语音服务。

本次已安装版本如下，记录用于复现；原 `requirements.txt` 未修改、未锁版本：

```text
aiohappyeyeballs==2.7.1
aiohttp==3.14.3
aiosignal==1.4.0
attrs==26.1.0
certifi==2026.7.22
edge-tts==7.2.8
frozenlist==1.8.0
idna==3.20
imageio-ffmpeg==0.6.0
multidict==6.9.1
pip==25.3
propcache==0.5.4
tabulate==0.10.0
typing_extensions==4.16.0
yarl==1.25.1
```

## 实际执行顺序

先阅读 `AGENTS.md`、`CODEX_HANDOFF.md`、`README_使用说明.md`、`CHECKS_验证范围.txt`，检查现有生成器后执行：

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe --version
.\.venv\Scripts\python.exe verify_project.py
.\.venv\Scripts\python.exe generate_audio.py --level ALL --all-entries --dry-run
.\.venv\Scripts\python.exe -X utf8 -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -X utf8 generate_audio.py --list-voices
.\.venv\Scripts\python.exe -X utf8 generate_audio.py --level N5 --start 1 --end 3
```

- `verify_project.py`：退出码 0；622 个唯一且顺序符合基线的条目、1,244 个例句；N5/N4/N3/N2 分别为 87/129/183/223 条；关键字段、页码、原 PDF/HTML 存在性及 Python AST 检查通过。此脚本不验证语言准确性。
- 全书 `--dry-run`：退出码 0，生成 `audio_output/playlist_ALL_study.json`。只生成朗读计划，未联网、未生成音频。
- 安装依赖：退出码 0，全部安装在 `.venv`。
- 声音列表：退出码 0；返回日语及中文声音，包括上述两种所选声音。
- 三条样例合成：退出码 0，成功 3/3，失败 0；顺序请求，保留生成器原有缓存与重试机制。
- 最后通过一次性 Python 验收脚本调用同一 FFmpeg 解码三条完整 MP3 至 24,000 Hz、单声道、16-bit PCM，在内存检查音频与字幕并写入机器可读报告；退出码 0。

## 样例验收

统一配置：`study` 模式、双语、使用不带括号注音的 `japanese` 原句、每句跟读留白 4 秒、常速 → 中文 → 慢速 → 留白 → 日语复读。使用原生成器默认的中日文编号/页码提示及停顿。

| 条目 | 原书页码 | MP3 字节数 | 解码时长 | 字幕段数 | 结果 |
|---|---:|---:|---:|---:|---|
| N5-001 | 10 | 443,063 | 36.824 秒 | 9 | 通过；未试听 |
| N5-002 | 10 | 520,542 | 43.280 秒 | 9 | 通过；未试听 |
| N5-003 | 11 | 446,241 | 37.088 秒 | 9 | 通过；未试听 |

三条逐一验证：

- MP3、SRT、JSON 均存在且非空；完整 MP3 解码成功，无空轨。
- 解码时长与 JSON 中 `duration_seconds` 一致至毫秒。
- 元数据 `id`、`title`、`pdf_page` 与原教材 JSON 一致；声音名称和内容/配置签名与朗读计划一致。
- SRT 序号连续、时间单调、无重叠、未超出音轨；每条 9 个字幕段的文本与该条朗读计划逐段完全一致。
- 每个带字幕的语音区间均有非静音 PCM 能量；机器可读报告记录各段起止时间及 RMS 电平。
- 保存每条 MP3 的 SHA-256，便于确认后续使用的文件仍是本次验收版本。

字幕检查属于分段时长与文本对应检查，**不是逐字强制对齐或听辨验收**。非静音也不等于发音正确。

## 文件与范围

本次新增内容仅在以下位置：

- `.venv/`：项目虚拟环境及已安装依赖。
- `audio_output/playlist_ALL_study.json`：622 条朗读计划，不是音频。
- `audio_output/_clip_cache/`：生成器缓存的已合成 PCM 片段。
- `audio_output/study_bilingual/N5/N5-001.{mp3,srt,json}`。
- `audio_output/study_bilingual/N5/N5-002.{mp3,srt,json}`。
- `audio_output/study_bilingual/N5/N5-003.{mp3,srt,json}`。
- `audio_output/sample_verification.json`：本次三条真实音频的机器可读验收记录。
- `LOCAL_VERIFICATION.md`：本记录。

未修改 `generate_audio.py`、`verify_project.py`、`requirements.txt`、原 PDF、教材 JSON 或 HTML。未执行全书语言校对。

## 剩余事项

1. 用户试听三个样例，确认中日音色、日语读音、语速及留白；确认前不扩展全书合成。
2. 其余 619 条尚未生成真实音频，1,244 个例句均未完成逐句发音审校。
3. 接入应用时需要明确区分预生成 MP3 与浏览器语音，并加入音频资源清单；当前生成器是每条整轨，SRT 是片段级字幕。
4. 完整中文语法、生词讲解仍需独立编写及审校口语稿，不能由本次例句样例代替。

本记录采用项目相对路径，不包含账户信息、密钥、令牌或个人绝对路径。
