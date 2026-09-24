# TED 离线查词数据来源

分词工具：SudachiPy 0.6.10；分词字典：SudachiDict-small 20260723。
项目：https://github.com/WorksApplications/SudachiPy 、https://github.com/WorksApplications/SudachiDict 。
两者采用 Apache-2.0，字典的 UniDic / NEologd 等来源声明见 SudachiDict-LEGAL.txt。
这些构建工具及完整分词字典没有打包到文章 JSON 中。

补充中文词义来自中文维基词典贡献者，由 Kaikki / Wiktextract 提取。
https://zh.wiktionary.org/ 及 https://kaikki.org/zhwiktionary/ 。
词典衍生部分采用 CC BY-SA 4.0；完整条款见 CC-BY-SA-4.0.txt。
每条词义的 source 字段保留原词条链接；下载文件、时间、校验和见 dictionary-sources.json。
处理修改：只取日语；合并简繁标题组、去重、提取原形/读音/词性/中文义项，
从旧格式文本中提取明确的读音和编号定义，排除结构化引文、音频和词源。
词典候选义项没有经过上下文词义消歧；例句由阅读界面展示当前文章原句。

原 PDF 正文、原译文及 glossary 保持不变，保留其原有来源和权利状态；
此词典许可不宣称涵盖原 PDF 内容，也不改变应用代码本身的许可证。
