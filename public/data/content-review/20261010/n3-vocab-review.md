# N3 单词全量主字段审校

逐条阅读全部 1659 条词形、假名及中英文主释义；完整 ID 和可应用 set 见 JSON。对疑点扩审原始附加义项／例句和 JMdict 英文原始条目。

确定修订记录 39 条，澄清建议 9 条。词头假名未发现必改项。没有试听音频，也没有宣称所有隐藏附加义项及词库例句已完整审读。

所有原值来自 v06-20261010-r1 发布分片，保留源文件、行位置、JMdict 编号及原始词典依据。

## 第 29 条：あと（あと）

ID：lex:openjlpt:57c650defa；类型：confirmed-correction

原值：{"meaningZh": "後：後面", "chineseSenses": ["後：後面", "跡：痕跡", "痕：痕跡，遺蹟，標誌，標記"], "meaning": "後：後面"}

建议：{"meaningZh": "痕迹；足迹；遗迹；伤痕", "chineseSenses": ["痕迹；足迹；标记", "遗址；遗迹", "伤痕"], "meaning": "痕迹；足迹；遗迹；伤痕"}

理由：英文和 JMdict 1383680 均指「跡／痕」，中文首义却取了同音的「後」。清除跨词的後面。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1383680

## 第 51 条：あんまり（あんまり）

ID：lex:openjlpt:3f1fbec85e；类型：confirmed-correction

原值：{"meaningZh": "剩余；残余；剩下的；余数；盈余；饭菜剩余", "chineseSenses": ["剩余；残余；剩下的；余数；盈余；饭菜剩余", "不太好；马马虎虎；平庸的", "不很；不太；不怎么"], "meaningEn": ["not very", "not much", "remainder", "rest"], "meaning": "剩余；残余；剩下的；余数；盈余；饭菜剩余"}

建议：{"meaningZh": "（后接否定）不太；不怎么；过于；太过分", "chineseSenses": ["（后接否定）不太；不怎么", "过于；太过分"], "meaningEn": ["(not) very", "(not) much", "too much", "excessively"], "meaning": "（后接否定）不太；不怎么；过于；太过分"}

理由：あんまり为口语副词／な形容词，不能把「あまり」名词的剩饭菜当作本条主要教学义。大辞泉将あんまり列为形动和副词，国际交流基金也说明其否定副词用法。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1584930
- https://kotobank.jp/word/%E4%BD%99%E3%82%8A-427212
- https://www.kyozai.jpf.go.jp/kyozai/material/BTS00155/ja/render.do

## 第 72 条：抱く（いだく）

ID：lex:openjlpt:97600f5aa8；类型：confirmed-correction

原值：{"meaningEn": ["(slang) to embrace", "to hug", "to harbour", "to entertain"]}

建议：{"meaningEn": ["to embrace", "to hug", "to harbour (a thought or feeling)", "to entertain (hope)"]}

理由：抱く（いだく）是普通词，不是 slang；去掉错误语域标注。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1584090

## 第 80 条：市場（いちば）

ID：lex:openjlpt:56d7bebebd；类型：confirmed-correction

原值：{"meaningEn": ["(the) market (as a concept)"]}

建议：{"meaningEn": ["marketplace", "(town or street) market"]}

理由：いちば指买卖场所；原英文 market as a concept 对应另一读法しじょう。中文与例句本身正确。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1308300

## 第 87 条：一体（いったい）

ID：lex:openjlpt:9a184ecb80；类型：confirmed-correction

原值：{"meaningZh": "在地球上，到底，在世界上（用於強調並表達懷疑）", "chineseSenses": ["在地球上，到底，在世界上（用於強調並表達懷疑）"], "meaning": "在地球上，到底，在世界上（用於強調並表達懷疑）"}

建议：{"meaningZh": "到底；究竟（用于疑问句，表示强调或疑惑）", "chineseSenses": ["到底；究竟（用于疑问句，表示强调或疑惑）", "一体；整体；一个整体"], "meaning": "到底；究竟（用于疑问句，表示强调或疑惑）"}

理由：on earth/in the world 在此为强调疑问的习语，不能译成在地球上／在世界上。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1164510

## 第 97 条：命（いのち）

ID：lex:openjlpt:c84ab5b83d；类型：confirmed-correction

原值：{"meaningEn": ["command", "decree", "life", "destiny"]}

建议：{"meaningEn": ["life", "life force", "lifetime", "destiny"]}

理由：命（いのち）不能使用命（めい）的 command/decree 义；其命运义在原词典存在，保留。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1531940

## 第 244 条：額（がく）

ID：lex:openjlpt:27db6f596b；类型：confirmed-correction

原值：{"meaningZh": "额板", "chineseSenses": ["额板", "数额"], "meaningEn": ["(picture) frame", "framed picture"], "meaning": "额板"}

建议：{"meaningZh": "画框；匾额；金额；数额", "chineseSenses": ["画框；有框的画；匾额", "金额；数额"], "meaningEn": ["(picture) frame", "framed picture", "amount (especially of money)", "sum"], "meaning": "画框；匾额；金额；数额"}

理由：额板不清楚且容易误解。がく的词典义为画框、框画及数额；两条原始例句也分别使用金额和画框。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1207500
- https://kotobank.jp/word/%E9%A1%8D-460037

## 第 256 条：欠ける（かける）

ID：lex:openjlpt:b5afc90a96；类型：confirmed-correction

原值：{"meaningZh": "受傷，破碎", "chineseSenses": ["受傷，破碎", "不足，欠缺", "（月）缺"], "meaningEn": ["to be lacking"], "meaning": "受傷，破碎"}

建议：{"meaningZh": "缺损；缺一块；欠缺；不足", "chineseSenses": ["缺损；缺一块", "缺少；欠缺；不足", "（月亮）亏缺"], "meaningEn": ["to be chipped", "to be damaged", "to be lacking", "to be deficient"], "meaning": "缺损；缺一块；欠缺；不足"}

理由：欠ける可指物体缺损或能力不足，直接写受伤容易误导为一般身体受伤；不是单纯碎成碎片。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1253920

## 第 273 条：方々（かたがた）

ID：lex:openjlpt:d9627ee0f6；类型：confirmed-correction

原值：{"meaningEn": ["persons", "this and that", "here and there", "everywhere"]}

建议：{"meaningEn": ["people", "persons (honorific)", "ladies and gentlemen"]}

理由：かたがた指各位／诸位；here and there/everywhere 属于同形词ほうぼう。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1584100

## 第 284 条：必ずしも（かならずしも）

ID：lex:openjlpt:f7eb9ecbff；类型：confirmed-correction

原值：{"meaningZh": "== 日语 ==", "chineseSenses": ["== 日语 =="], "meaning": "== 日语 =="}

建议：{"meaningZh": "（与否定搭配）未必；不一定；不全都", "chineseSenses": ["（与否定搭配）未必；不一定；不全都"], "meaning": "（与否定搭配）未必；不一定；不全都"}

理由：原中文仅为 Wiki 标题 == 日语 ==，不是释义。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1487410

## 第 383 条：競技（きょうぎ）

ID：lex:openjlpt:b98c5c8b36；类型：confirmed-correction

原值：{"meaningZh": "運動類型，體育（學科、通稱）", "chineseSenses": ["運動類型，體育（學科、通稱）", "比賽技術"], "meaning": "運動類型，體育（學科、通稱）"}

建议：{"meaningZh": "竞技；比赛；体育比赛项目", "chineseSenses": ["竞技；比赛；体育比赛项目"], "meaning": "竞技；比赛；体育比赛项目"}

理由：競技是比赛／竞技项目，原中文把它写成体育学科或比赛技术，容易与体育／技術混淆。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1234080

## 第 418 条：臭い（くさい）

ID：lex:openjlpt:def0fe1435；类型：confirmed-correction

原值：{"meaningEn": ["odour", "scent", "smell", "stench"]}

建议：{"meaningEn": ["stinking", "smelly", "suspicious", "fishy"]}

理由：くさい为い形容词；odour/scent/smell/stench 是名词におい的释义。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1333150

## 第 551 条：越す（こす）

ID：lex:openjlpt:1a796e4b69；类型：confirmed-correction

原值：{"meaningZh": "去；来", "chineseSenses": ["去；来", "越过；跨越；穿过", "克服；渡过"], "meaningEn": ["to go over (e.g. with audience)"], "meaning": "去；来"}

建议：{"meaningZh": "越过；跨过；度过；超过；搬家", "chineseSenses": ["越过；跨过", "克服；度过（困难或一段时间）", "超过；胜过", "搬家"], "meaningEn": ["to cross over", "to go across", "to get through", "to surpass", "to move house"], "meaning": "越过；跨过；度过；超过；搬家"}

理由：原英文 go over (with audience) 是误取英语习语，不能解释越す；来／去是周边语境义，主释义应体现例句中的跨越／度过。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1175300

## 第 599 条：桜（さくら）

ID：lex:openjlpt:b66409ed87；类型：confirmed-correction

原值：{"meaningZh": "樱桃树，多指山樱（Prunus serrulata）", "chineseSenses": ["樱桃树，多指山樱（Prunus serrulata）", "樱花", "樱桃树", "樱桃树皮", "桜色 (sakura-iro)的简称：粉色，樱花色"], "meaning": "樱桃树，多指山樱（Prunus serrulata）"}

建议：{"meaningZh": "樱花；樱树", "chineseSenses": ["樱花；樱树", "樱树皮", "樱花色；淡粉色"], "meaning": "樱花；樱树"}

理由：泛指观赏樱的さくら应译樱花／樱树，不能只写樱桃树并无条件限定单一学名。原中文还把山樱和 Prunus serrulata 简化对应，删除不必要的分类学限定。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1593710
- https://kotobank.jp/word/%E6%A1%9C-448703
- https://www.maff.go.jp/j/heya/annai/tusin/attach/pdf/index-127.pdf

## 第 603 条：支える（ささえる）

ID：lex:openjlpt:9923ca40cb；类型：confirmed-correction

原值：{"meaningEn": ["to be blocked", "to choke", "to be obstructed"]}

建议：{"meaningEn": ["to support", "to prop", "to sustain", "to hold up", "to hold at bay"]}

理由：ささえる意为支撑／维持／抵挡；原英文混入同字つかえる的堵住／噎住义。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1310090

## 第 634 条：直に（じかに）

ID：lex:openjlpt:8b180f444a；类型：confirmed-correction

原值：{"meaningEn": ["immediately", "readily", "directly"]}

建议：{"meaningEn": ["directly", "in person", "firsthand"]}

理由：じかに是直接地／亲身，immediately/readily 混入じき（に）等其他读法。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1430690

## 第 675 条：品（しな）

ID：lex:openjlpt:63d9f749c6；类型：confirmed-correction

原值：{"meaningEn": ["thing", "article", "goods", "dignity", "article (goods)", "counter for meal courses"]}

建议：{"meaningEn": ["article", "item", "goods", "thing", "quality"]}

理由：しな指物品、货品、品质；dignity属于品（ひん），不能无标记混入。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1583470

## 第 684 条：しまい（しまい）

ID：lex:openjlpt:5e5a5dfee9；类型：confirmed-correction

原值：{"meaningZh": "结束，完毕", "chineseSenses": ["结束，完毕", "卖光，卖完"], "meaning": "结束，完毕"}

建议：{"meaningZh": "姐妹；姊妹", "chineseSenses": ["姐妹；姊妹"], "meaning": "姐妹；姊妹"}

理由：原英文 sisters、JMdict 1579490 和两条例句都指姉妹；中文误配同音仕舞的结束／卖完。保持原 ID 和かな词形，仅纠正中文。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1579490

## 第 708 条：住宅（じゅうたく）

ID：lex:openjlpt:b1905d8e82；类型：confirmed-correction

原值：{"meaningEn": ["resident", "housing"]}

建议：{"meaningEn": ["residence", "housing", "residential building"]}

理由：resident是居民，residence才是住所。原英文混淆人和建筑。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1334150

## 第 745 条：少女（しょうじょ）

ID：lex:openjlpt:17c0d3a658；类型：confirmed-correction

原值：{"meaningEn": ["daughter", "young lady", "virgin", "maiden", "little girl"]}

建议：{"meaningEn": ["girl", "young lady"]}

理由：しょうじょ为少女／年轻女孩；daughter、virgin等不是此读法的一般义，容易混入古语／其他词。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1580290

## 第 767 条：食品（しょくひん）

ID：lex:openjlpt:50463fe8e3；类型：confirmed-correction

原值：{"meaningEn": ["commodity", "foodstuff"]}

建议：{"meaningEn": ["food", "food products", "foodstuffs"]}

理由：食品应为食品／食物产品；commodity泛指商品，范围过大，会误导成任意货品。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1358600

## 第 819 条：末（すえ）

ID：lex:openjlpt:4f0c39291a；类型：confirmed-correction

原值：{"meaningEn": ["the end of", "powder"]}

建议：{"meaningEn": ["end", "tip", "end of a period", "(finally) after"]}

理由：末（すえ）为末端／期末／经过之后；powder对应末（まつ），不能混入。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1525250

## 第 825 条：少しも（すこしも）

ID：lex:openjlpt:5569286656；类型：confirmed-correction

原值：{"meaningZh": "== 日语 ==", "chineseSenses": ["== 日语 =="], "meaningEn": ["anything of", "not one bit"], "meaning": "== 日语 =="}

建议：{"meaningZh": "（与否定搭配）一点也不；丝毫不", "chineseSenses": ["（与否定搭配）一点也不；丝毫不"], "meaningEn": ["(not) at all", "(not) a bit", "(not) in the least"], "meaning": "（与否定搭配）一点也不；丝毫不"}

理由：中文为 Wiki 标题残留；补上与否定搭配的实际意思，英文也用完整否定结构。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1348900

## 第 854 条：成功（せいこう）

ID：lex:openjlpt:99906bc37f；类型：confirmed-correction

原值：{"meaningZh": "完成", "chineseSenses": ["完成"], "meaning": "完成"}

建议：{"meaningZh": "成功；取得成功；成就", "chineseSenses": ["成功；取得成功", "成就；功成名就"], "meaning": "成功；取得成功；成就"}

理由：完成不必然成功；成功指达成期望结果，原译抹去了核心意义。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1375690

## 第 891 条：選手（せんしゅ）

ID：lex:openjlpt:72f846250a；类型：confirmed-correction

原值：{"meaningEn": ["player (in game)", "team"]}

建议：{"meaningEn": ["player (of a sport)", "athlete", "team member"]}

理由：選手是队员／运动员，不是整个 team。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1392250

## 第 910 条：育つ（そだつ）

ID：lex:openjlpt:e62a18d68e；类型：confirmed-correction

原值：{"meaningEn": ["to raise (child)", "to be brought up", "to grow (up)"]}

建议：{"meaningEn": ["to be raised", "to be brought up", "to grow up"]}

理由：育つ是不及物动词。原 to raise (child) 应为被养育，避免与育てる混淆。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1160540

## 第 928 条：他（た）

ID：lex:openjlpt:7adaa6336c；类型：confirmed-correction

原值：{"meaningEn": ["other (esp. places and things)"]}

建议：{"meaningEn": ["other (especially people and abstract matters)"]}

理由：原英文限定 places and things 与本条他（た）的原词典条目相反；中文无需改。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1949190

## 第 954 条：ダイヤ（ダイヤ）

ID：lex:openjlpt:771ae04338；类型：confirmed-correction

原值：{"meaningEn": ["dyer", "diagram", "(railway) schedule", "diamond"], "chineseSenses": ["(铁路)时刻表；班次表", "图表；图解"]}

建议：{"meaningEn": ["(railway) schedule", "timetable", "diagram", "diamond"], "chineseSenses": ["（铁路）时刻表；班次表", "图表；图解", "钻石（ダイヤモンド的简称）"]}

理由：dyer指染色工，并非ダイヤ常规借词义；保留另一个真实同形词diamond，同时补中文钻石以对应已有英文。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=2855660

## 第 978 条：だって（だって）

ID：lex:openjlpt:01558111d1；类型：confirmed-correction

原值：{"meaningZh": "(係助詞)", "chineseSenses": ["(係助詞)", "(係助詞)；表示某個對象不是例外，而是在一般情況下被包括：甚至，也", "(係助詞)；表示列舉的事物屬於同一類別：例如，之類", "(係助詞)；(跟隨疑問詞或表示疑問、數量或程度的詞) 表示沒有例外的意思：無論", "(終助詞，用於引用句子) 用來強調不滿或驚訝"], "meaning": "(係助詞)"}

建议：{"meaningZh": "连……也；即使……也；因为；可是", "chineseSenses": ["连……也；即使……也", "也；同样", "因为；可是（口语）", "听说；你是说（引述或确认）"], "meaning": "连……也；即使……也；因为；可是"}

理由：原主释义仅写词性「係助詞」，不能当作中文释义。补与英文及例句对应的实际用法。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=2643970

## 第 1001 条：単語（たんご）

ID：lex:openjlpt:b91001d17a；类型：confirmed-correction

原值：{"meaningZh": "字", "chineseSenses": ["字", "单词"], "meaningEn": ["word", "vocabulary", "(usually) single-character word"], "meaning": "字"}

建议：{"meaningZh": "单词；词", "chineseSenses": ["单词；词"], "meaningEn": ["word", "vocabulary"], "meaning": "单词；词"}

理由：単語不等于单个字，也不是通常由一个字符组成；英文single-character限定错误。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1417330

## 第 1085 条：提案（ていあん）

ID：lex:openjlpt:b8c0205de7；类型：confirmed-correction

原值：{"meaningZh": "提出", "chineseSenses": ["提出", "提議"], "meaning": "提出"}

建议：{"meaningZh": "提案；建议；提出建议", "chineseSenses": ["提案；建议", "提出建议"], "meaning": "提案；建议；提出建议"}

理由：提案有明确的方案／建议含义；单写提出过于泛化且不对应名词例句。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1436320

## 第 1089 条：程度（ていど）

ID：lex:openjlpt:dfb2d21193；类型：confirmed-correction

原值：{"meaningZh": "進度，範圍", "chineseSenses": ["進度，範圍", "水準，標準", "大概，大約"], "meaning": "進度，範圍"}

建议：{"meaningZh": "程度；水平；标准；大约", "chineseSenses": ["程度；水平；标准", "大约；左右（接数量后）"], "meaning": "程度；水平；标准；大约"}

理由：程度不是进度。原中文很容易与進度／進み具合混淆。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1436540

## 第 1231 条：熱中（ねっちゅう）

ID：lex:openjlpt:c03a75fe96；类型：confirmed-correction

原值：{"meaningEn": ["nuts!", "enthusiasm", "zeal", "mania"]}

建议：{"meaningEn": ["being absorbed in", "being enthusiastic about", "being engrossed in"]}

理由：nuts!作为独立感叹语与热衷不符；可说be nuts about，但不是原来的惊叹词。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1467950

## 第 1289 条：バッグ（バッグ）

ID：lex:openjlpt:7a68fa62f5；类型：confirmed-correction

原值：{"meaningEn": ["bag", "bug"]}

建议：{"meaningEn": ["bag"]}

理由：バッグ为包。bug通常是バグ，不能混入本条。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1099100

## 第 1368 条：武器（ぶき）

ID：lex:openjlpt:e4b01b085c；类型：confirmed-correction

原值：{"meaningEn": ["weapon", "arms", "ordinance"]}

建议：{"meaningEn": ["weapon", "arms", "ordnance"]}

理由：ordinance是法令；武器义应拼作ordnance。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1498460

## 第 1517 条：明確（めいかく）

ID：lex:openjlpt:1be11a9bbe；类型：confirmed-correction

原值：{"meaningEn": ["clear up", "clarify", "define"]}

建议：{"meaningEn": ["clear", "precise", "definite", "distinct"]}

理由：明確是な形容词；原英文全是动词，属于把明確にする的意思放进词条。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1532410

## 第 1589 条：容易（ようい）

ID：lex:openjlpt:120086e720；类型：confirmed-correction

原值：{"meaningZh": "容易；简单；朴素", "chineseSenses": ["容易；简单；朴素"], "meaning": "容易；简单；朴素"}

建议：{"meaningZh": "容易；简单；不困难", "chineseSenses": ["容易；简单；不困难"], "meaning": "容易；简单；不困难"}

理由：英文plain在这里表达容易／明白，不是衣着风格的朴素；原机器中文误取英语多义词。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1545350

## 第 1600 条：横切る（よこぎる）

ID：lex:openjlpt:dfec3a3604；类型：confirmed-correction

原值：{"meaningEn": ["to cross (e.g. arms)", "to traverse"]}

建议：{"meaningEn": ["to cross (e.g. a road)", "to traverse"]}

理由：横切る是穿过／横穿；cross ones arms对应腕を組む，原e.g. arms误导。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1180860

## 第 1617 条：ライター（ライター）

ID：lex:openjlpt:0294bdc5ab；类型：confirmed-correction

原值：{"meaningEn": ["lighter", "rider", "writer"], "chineseSenses": ["打火机；点火器"]}

建议：{"meaningEn": ["lighter", "writer"], "chineseSenses": ["打火机；点火器", "撰稿人；作者（另一个同形外来词）"]}

理由：rider的日语通常是ライダー；ライター可为lighter或writer。删除浊音不同的骑手义，保留真实同形词并补对应中文。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1137880

## 第 192 条：お昼（おひる）

ID：lex:openjlpt:29010ee3b0；类型：clarification

原值：{"meaningZh": "白天", "meaning": "白天"}

建议：{"meaningZh": "午餐；中午；白天", "meaning": "午餐；中午；白天"}

理由：原词典确实含daytime，不能判原义错误；但两条例句分别是午餐／中午，主释义宜并列说明。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1660100

## 第 415 条：句（く）

ID：lex:openjlpt:44bc159936；类型：clarification

原值：{"meaningZh": "文段；句子；段落；章节", "chineseSenses": ["文段；句子；段落；章节"], "meaningEn": ["sentence"], "meaning": "文段；句子；段落；章节"}

建议：{"meaningZh": "短语；语句；（诗的）句；俳句", "chineseSenses": ["短语；语句", "（诗的）句；俳句", "文段；段落"], "meaningEn": ["phrase", "sentence", "passage", "verse", "haiku"], "meaning": "短语；语句；（诗的）句；俳句"}

理由：原词典有sentence/passage等义，不能一概判错；本条例句均为phrase，补短语并避免把章节当首义。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1243940

## 第 585 条：最中（さいちゅう）

ID：lex:openjlpt:40b4a7cb92；类型：clarification

原值：{"meaningZh": "最高潮，最佳時期", "chineseSenses": ["最高潮，最佳時期", "當中，期間"], "meaning": "最高潮，最佳時期"}

建议：{"meaningZh": "正在……的时候；正当中；进行中", "chineseSenses": ["正在……的时候；正当中；进行中", "最盛时；高潮期间"], "meaning": "正在……的时候；正当中；进行中"}

理由：最中可有at the height of义，但不必然是最佳时期；本条例句均指某动作正在进行。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1579210

## 第 783 条：尻（しり）

ID：lex:openjlpt:55b77976ae；类型：clarification

原值：{"meaningZh": "尾端，末端", "meaning": "尾端，末端"}

建议：{"meaningZh": "屁股；臀部；底部；末端", "meaning": "屁股；臀部；底部；末端"}

理由：尾端／末端是真实次义，但应把两条例句和英文对应的臀部放在主释义中。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1358760

## 第 838 条：スピーチ（スピーチ）

ID：lex:openjlpt:92387d38a4；类型：clarification

原值：{"meaningZh": "谈话，言语。", "chineseSenses": ["谈话，言语。", "说话方式。", "演说。"], "meaning": "谈话，言语。"}

建议：{"meaningZh": "演讲；致辞；讲话", "chineseSenses": ["演讲；致辞；讲话"], "meaning": "演讲；致辞；讲话"}

理由：学习者使用スピーチ主要指面对听众的演讲或致辞。调整主释义以配合例句，避免把英文speech的全部语言学含义直接套进借词。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1072260

## 第 947 条：態度（たいど）

ID：lex:openjlpt:88273999d5；类型：clarification

原值：{"meaningZh": "意見，看法", "chineseSenses": ["意見，看法", "行為，舉止"], "meaning": "意見，看法"}

建议：{"meaningZh": "态度；举止；立场", "chineseSenses": ["态度；举止；神态", "（对某事的）态度；立场"], "meaning": "态度；举止；立场"}

理由：意见／看法可与立场相关，但不足以概括态度；两条例句都指行为神态。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1410780

## 第 1248 条：望み（のぞみ）

ID：lex:openjlpt:8d2c6575c2；类型：clarification

原值：{"meaningZh": "眺望。", "chineseSenses": ["眺望。", "愿望。", "希望。", "众望。"], "meaning": "眺望。"}

建议：{"meaningZh": "希望；愿望；期望", "chineseSenses": ["希望；愿望", "可能性；前景"], "meaning": "希望；愿望；期望"}

理由：眺望不是本条wish/hope的教学目标义；调整为与当前英文和例句一致的愿望／期望。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1519620

## 第 1425 条：棒（ぼう）

ID：lex:openjlpt:b780931140；类型：clarification

原值：{"meaningZh": "杖，長6尺（約1.8公尺），用於武術中，如棒術 (bōjutsu)", "chineseSenses": ["杖，長6尺（約1.8公尺），用於武術中，如棒術 (bōjutsu)", "棍子狀或長的圓柱形物品", "直線；桿", "「直線」的狀態；連續的", "因疲勞而繃緊的腿部肌肉"], "meaning": "杖，長6尺（約1.8公尺），用於武術中，如棒術 (bōjutsu)"}

建议：{"meaningZh": "棍；棒；杆", "chineseSenses": ["棍；棒；杆", "线；横杠", "（棒术中的）长棍"], "meaning": "棍；棒；杆"}

理由：棒并非必定六尺武术棍；原说明是狭义用途，主释义需涵盖普通棍棒。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1519750

## 第 1472 条：全く（まったく）

ID：lex:openjlpt:2eb5b8f659；类型：clarification

原值：{"meaningZh": "（用于否定句）完全", "chineseSenses": ["（用于否定句）完全", "真的"], "meaning": "（用于否定句）完全"}

建议：{"meaningZh": "完全；全然；实在；真的", "chineseSenses": ["完全；全然（肯定或否定句均可）", "实在；真的"], "meaning": "完全；全然；实在；真的"}

理由：全く并不只用于否定，例如全く同じ；避免原括注造成不必要的语法限制。

- https://www.edrdg.org/jmdictdb/cgi-bin/entr.py?svc=jmdict&q=1394800

## 其他已审查问题

- 第 1120 条：怎么／恳请义的どうか例句与原英文copper coin/JMdict銅貨冲突。当前发布版已标needs-review且移除例句，保留英文。建议先继续隔离，不强行改写原分级词条身份。
- 第 273 条：例句为各处的意思，应读ほうぼう；与词条かたがた目标义不符，建议继续不用于本条。当前发布sentences=[]。
- 第 418 条：宾语气味是名词におい，不能读くさい；与形容词词条不匹配，建议继续隔离。当前发布sentences=[]。
- 第 1393 条：船的水上飞机义看似反常，但本地JMdict原英文明确含seaplane，因此撤回机器错译判断，未列入修订清单。
- 第 410 条：近代的present day已存在JMdict，并非单凭时代划分即可判错；可另补modern times，非必要。
- 第 425 条：下り的开往路线终点定义和down-slope均可由JMdict核实，保留。
- 第 298 条：空（から）的中文及附加义项混入そら；full_content_audit统一记录并修订，避免重复set。
- 第 762 条：証明附加义项模板残留由full_content_audit统一处理。
- 第 1261 条：バイオリン模板残留由full_content_audit统一处理。
