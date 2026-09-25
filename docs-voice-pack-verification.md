# 已安装自然语音包验收

检查时间：2026-09-25T06:08:01+00:00（UTC）；模式：offline-verification。

通过 104/104；失败 0。**未试听。**

清单中的每个片段都根据当前教材原句重新构造签名，并验证 MP3 完整解码、时长、非静音、SHA-256、原文、页码、声音及 SRT 起止时间。SRT 为整句单段，不是逐字对齐。解码成功不能证明读音、重音和语调正确；N2-001-2「十分」需核对是否读作じゅうぶん。

默认只离线验收：`python scripts/generate_voice_pack.py`。显式添加条目：`python scripts/generate_voice_pack.py --entries N3-001 N3-002`；不接受全书通配符，保留已有清单与音频。联网采用既有 edge-tts、顺序请求、缓存和有限重试；无新增付费服务。

详见 `public/audio/voices/verification.json`。
