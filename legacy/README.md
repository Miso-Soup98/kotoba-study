# 旧版音频工具

这些文件从原项目保留。新仓库的教材在 `public/data/grammar.json`，便携网页在 `public/reader.html`。
`README_使用说明.md` 和 `CHECKS_验证范围.txt` 是历史说明，制作时还没有生成真实音频；
本次新增三条样例及实际验证见根目录 `docs-audio-verification.md`。

从仓库根目录运行（Windows）：

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r legacy/requirements.txt
.venv\Scripts\python.exe legacy/generate_audio.py --data public/data/grammar.json --level ALL --all-entries --dry-run
.venv\Scripts\python.exe legacy/generate_audio.py --data public/data/grammar.json
```

macOS / Linux 使用 `.venv/bin/python`。默认只合成 N5-001～003，不应在试听确认前启动全书。
完整中文语法讲解尚未实现。旧版结构校验器已适配此仓库的教材路径。
