# 数据署名与许可

词汇衍生数据采用 **CC BY-SA 4.0**。包含 OpenJLPT、Jonathan Waller JLPT Resources、JMdict（EDRDG）、中文维基词典贡献者（经 Kaikki/Wiktextract 提取）和 Tomoshi（Y1Z）贡献。代码许可不因此更改。改动包括字段重整、中文候选匹配、按 JMdict ID 补充中文、数据质量隔离和 `source-corrections.json` 中列出的具体订正。

须在应用可达的「数据来源/关于」及数据目录保留这些署名和许可链接。每条中文维基词典义项继续保留原词条 URL。下述许可文件位于本目录的 [licenses](licenses/ATTRIBUTION.md)；本应用订正记录在 [audit/source-corrections.json](audit/source-corrections.json) 与 [audit/manual-chinese.json](audit/manual-chinese.json)。

- OpenJLPT 与上游完整声明：`OpenJLPT-NOTICE.md`。
- CC BY-SA 4.0 原文：`CC-BY-SA-4.0.txt`；https://creativecommons.org/licenses/by-sa/4.0/legalcode 。
- JMdict 由 Electronic Dictionary Research and Development Group 持有，遵照 https://www.edrdg.org/edrdg/licence.html 使用。离线副本 `EDRDG-licence.html`。其条款要求建立定期更新流程；不能将本次固定快照永久视作已更新。
- Tomoshi 中文层只使用 CC BY-SA 4.0 表，署名 **Tomoshi (Y1Z)**；`Tomoshi-LICENSE.md`、`Tomoshi-NOTICE.md`。不要使用其品牌暗示背书。
- 中文维基词典：https://zh.wiktionary.org/ ；Kaikki：https://kaikki.org/zhwiktionary/ 。未引入词典内第三方作品引文、音频和图片。

## Tatoeba 例句单独署名

本包日文和英文例句来源于 Tatoeba。官方详细导出声明 **Creative Commons Attribution 2.0 France (CC BY 2.0 FR)**，见 https://tatoeba.org/en/downloads ；作者署名要求见 https://tatoeba.org/en/terms_of_use 。并非所有音频采用相同许可；本包不使用 Tatoeba 音频。

每条例句旁建议显示：

> 日文：{japanese.username} · 英文：{english.username}（Tatoeba，CC BY 2.0 FR）

用户名分别链接 `authorUrl`；日文、英文「原句」分别链接各自 `sourceUrl`；许可链接 https://creativecommons.org/licenses/by/2.0/fr/ ，原文 https://creativecommons.org/licenses/by/2.0/fr/legalcode.fr 。离线原文副本 `CC-BY-2.0-FR-legalcode.html` 来自 Creative Commons 官方 GitHub 仓库（官网本次直接下载返回 403），见 `license-sources.json` 的 URL 和哈希。

`tatoeba-attribution.json` 保存两侧句 ID、用户名、句子精确文本和许可。只发布其中两侧均能对应的句对，再排除 `example-review-candidates.json` 的语义风险词；缺署名或对不上的例句不发布。不要把不存在的作者伪造为 Tanaka/Tatoeba：虽然官方说明许多历史日英句来自公有领域 Tanaka Corpus，不能凭句龄自动确定本条出处。

Tatoeba 文本在本步骤未翻译或改写。OpenJLPT 的振假名为额外派生显示信息，不能冒称 Tatoeba 作者亲自添加或人工校对。
