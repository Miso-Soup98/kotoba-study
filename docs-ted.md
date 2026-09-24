# TED 精读开发与私人导入

资料属于私人实例，代码和第三方许可可公开。不要将自己的 PDF、音频、OCR 文稿、词典导出或学习备份放进 `public/` 或提交 Git。`private-content/`、`.dev.vars*`、`.sites-runtime/` 已忽略。

## 阅读与精听

电脑悬停原文词语速查，点按打开可滚动的完整词卡；触屏直接点按。词卡区分表层形、原形与各自读音，释义是候选词义，例句取自当前文章。无可靠词典匹配时保留表层形，不把活用读音挂到原形上。加入生词本后，可在生词本加入现有 FSRS 复习。

播放器用原 MP3，不生成新配音。A/B 可在播放时设置，也可输入秒数；保存多组后点击颜色条或名称播放。区域包含 UUID、名称、颜色、起止秒数和可选段落 ID。编辑已有区域时，可明确改为当前选中段落或解除关联。全文播放会退出区域循环并回到开头；拖动或退 5 秒会退出区域循环。

区域、生词、播放位置、收藏与完成标记使用既有追加事件同步和备份格式。不同区域独立更新，删除保留事件；同一区域的并发修改按服务器最后确认事件生效。保存前使用与服务器一致的事件校验，避免过长词卡阻塞同步。

后台或锁屏时浏览器可能挂起定时器；本版循环针对前台学习，未承诺后台精确边界。时间标记不是音频切片文件，也没有自动逐句字幕对齐。

## 本次资料检查

- 300 篇，594 页；新/老两套分别编号，原 ID、顺序及页码保留。
- OCR 在本机执行；1,592 段中 949 对按版面配对，另 643 段单侧保留，不猜测翻译对应。仅首篇人工对照原图，其余 299 篇待校对。
- 3,310 项原词注保留；其中 899 项词形不确定，不参与覆盖词典。
- 92,981 个 token 逐字回拼与原提取日文相同。中文词义覆盖 66,415 / 82,047 个学习词次（80.95%）；实词覆盖 79.67%；144 词次自动读音缺失。覆盖率不是正确率。
- 300 条音频（285 个唯一文件）全段解码成功，未试听。两份 WAV 与一份实际为 AAC 的文件转成兼容 MP3，原件未改。
- 233 条存在按码率估算时长的 FFmpeg 提示，无解码失败；清单与解码时长最大差约 0.049 秒。重复音频保留并提示，不据此确认其 PDF 内容匹配。

## 构建查词数据

需要独立 Python 虚拟环境。本次 Python 3.13.12、SudachiPy 0.6.10、SudachiDict-small 20260723。

```sh
python -m venv .venv
# Windows 使用 .venv/Scripts/python.exe；下列 python 指该虚拟环境
python -m pip install -r scripts/ted/requirements-dictionaries.txt
python scripts/ted/download_dictionaries.py
python scripts/ted/test_enrich_ted.py
python scripts/ted/enrich_ted.py
python scripts/ted/verify_ted_enrichment.py
```

默认目录为 `private-content/ted/`：输入 `export/ted-*.json`，字典 `dictionaries/`，输出 `enriched/`。构建器与独立校验器支持 `--input` / `--output`，构建器还支持 `--dictionaries`。只有下载器联网，顺序下载公开词典并校验快照；正文不会发给词典服务。

输入文章包含 `id`（如 `ted-new-001`）、`title`、`collection`（`new` / `old`）、`number`、`pages`、`paragraphs`、`glossary`、`notes` 和 `warnings`。段落包含 `id/page/japanese/chinese`，未配对的一侧留空。词注包含 `term/reading/meaning/usage/examples/page`；不确定词形设置 `uncertainTerm: true`。构建器新增 `tokens`、`dictionary`、来源和统计，不重写原文。

本次扫描识别依赖原资料版面及 Windows 本地 OCR，审计稿和字框留在原工作区；通用词典构建器从已提取的 JSON 开始，不宣称能识别任意 PDF。

## 私人实例存储与导入

D1 保存目录元数据和按账号隔离的学习事件，R2 保存文章 JSON、PDF、MP3。部署绑定为 `DB` / `BUCKET`，迁移文件 `drizzle/0001_flippant_prism.sql` 只新增目录表。

`/api/ted`、`/api/ted/article`、`/api/ted/media` 都要求可信 ChatGPT 身份；官方实例还由平台限制为仅所有者访问。文章目录是该实例共享资料库，不是多租户私人文件空间。自行部署必须保留可信认证网关；扩大站点访问范围前需重新设计资料授权，不能只移除平台登录。

导入接口默认关闭，临时配置至少 32 字符的 `TED_IMPORT_SECRET` 后才可使用。生产密钥存于平台环境变量，不能放进前端、仓库或命令参数。本地可用被忽略的 `.dev.vars`。平台网关的既有 API 凭据与应用导入密钥分开传入，普通登录用户无导入权限。

```sh
node scripts/import-ted.mjs --origin=https://YOUR-PRIVATE-SITE --root=/ABS/CONTENT/ROOT --inventory=/ABS/inventory.json --articles=/ABS/enriched --mode=all --concurrency=1
```

清单格式为 `{ "items": [...] }`，每项有 `id/sourcePdf/sourceAudio/durationSeconds/warnings/audioDuplicateIds`。文件路径相对于 `--root`，不能越过该目录。音频输入应为 MP3。最大 PDF/音频 48 MB，单篇 JSON 6 MB。

脚本就绪后，凭据通过隐藏标准输入的一行 JSON 传入（`secret` 与可选 `bypass`），不得提交真实值。支持 `--mode=media` / `articles`、`--limit=N`、`--report=PATH`；默认顺序请求，必要时可设置最多 3 个导入任务。SHA-256 与文件大小核验、有限重试、远端哈希跳过和检查点报告支持断点续传。

导入后核对完整性，并移除 `TED_IMPORT_SECRET`、重新部署，使写入入口关闭。GET/HEAD 音频支持单段字节 Range（含 Safari 的 `bytes=0-1` 探测），并禁止共享缓存。Service Worker 不缓存私人 API 或媒体。

## 来源与许可

中文词义来自中文维基词典贡献者，经 Kaikki / Wiktextract 提取，派生部分 CC BY-SA 4.0；Sudachi 工具及上游词典声明单独保留。见 [第三方声明](public/ted-licenses/THIRD_PARTY_NOTICES.md)。原 PDF、翻译及音频的权利状态与代码和词典独立。
