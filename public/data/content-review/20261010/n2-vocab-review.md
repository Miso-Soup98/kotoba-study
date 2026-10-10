# N2 词库逐条审校

已逐条审读全部 1778 条的词形、假名、中文主义、英文义项、附加中文义项。回查 56 个疑点条目的完整记录/例句。并非全部词汇例句的人工审校；未试听音频。

建议涉及 65 个条目，共 122 个字段。没有确认需要更改的单词假名。

## 4. 遭う（あう） / lex:openjlpt:5b1dbc60e6

类别：correction；理由：遭う应突出不幸遭遇，与会う的一般见面相区分；现有例句为遭雨。

```json
{
  "original": {
    "meaningZh": "相遇；碰面；见面",
    "chineseSenses": [
      "相遇；碰面；见面"
    ]
  },
  "suggested": {
    "meaningZh": "遭遇；碰上（通常指事故、灾难等不愉快的事）",
    "chineseSenses": [
      "遭遇；碰上（通常指事故、灾难等不愉快的事）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1198180。

## 13. 挙げる（あげる） / lex:openjlpt:8c256fc677

类别：clarification；理由：起义是有限搭配，不能作为挙げる的唯一主释义；两例分别为举手和成名。

```json
{
  "original": {
    "meaningZh": "起义；举兵；武装反抗",
    "chineseSenses": [
      "起义；举兵；武装反抗",
      "生育；生养；抚养；养育",
      "抬起；举起；提高；升高"
    ]
  },
  "suggested": {
    "meaningZh": "举起；抬起；列举；举出",
    "chineseSenses": [
      "举起；抬起；列举；举出",
      "举行（仪式、活动）；取得（成果）；成名",
      "起兵；生育、养育（特定搭配）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 2864818。

## 59. 幾分（いくぶん） / lex:openjlpt:363c73e228

类别：correction；理由：主英文与两例都是程度副词；原中文只剩字面分割解释。

```json
{
  "original": {
    "meaningZh": "分开几部分(中的一部分)",
    "chineseSenses": [
      "分开几部分(中的一部分)"
    ]
  },
  "suggested": {
    "meaningZh": "多少；有些；稍微；在某种程度上",
    "chineseSenses": [
      "多少；有些；稍微；在某种程度上",
      "一部分；若干"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1220060。

## 68. 一応（いちおう） / lex:openjlpt:99ff21adbb

类别：correction；理由：只想确认一下是语境句译，不能等同一応本身。

```json
{
  "original": {
    "meaningZh": "只想確認一下",
    "chineseSenses": [
      "只想確認一下",
      "以防萬一",
      "目前，暫時",
      "姑且，暂且",
      "大致，大略"
    ]
  },
  "suggested": {
    "meaningZh": "姑且；暂且；大致；基本上",
    "chineseSenses": [
      "姑且；暂且；大致；基本上",
      "以防万一；一次"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1161170。

## 71. 佚（いつ） / lex:openjlpt:a86f29464a

类别：correction；理由：佚（いつ）作为此词条的名词是安逸；原英文混入汉字字义串，词形/读音本身不改。

```json
{
  "original": {
    "meaningEn": [
      "be lost",
      "peace",
      "hide",
      "mistake",
      "beautiful",
      "in turn"
    ],
    "meaningZh": null,
    "chineseSenses": null
  },
  "suggested": {
    "meaningEn": [
      "being comfortable",
      "relaxing"
    ],
    "meaningZh": "舒适；安逸",
    "chineseSenses": [
      "舒适；安逸"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1585390。

## 101. 承る（うけたまわる） / lex:openjlpt:a4847f22e0

类别：correction；理由：此现代学习条目应明确闻听和接受的谦让义；“说且只用于他人”会与おっしゃる混淆；删去未标时代的义项。

```json
{
  "original": {
    "meaningZh": "接受，受ける (ukeru)的謙語",
    "chineseSenses": [
      "接受，受ける (ukeru)的謙語",
      "閱讀、查看 (源於接受信件或文件)",
      "聽、聽取，聞く (kiku)的謙語",
      "知道、同意、接受 (命令或指示)",
      "說 (對象僅限於他人，不用於自己)"
    ]
  },
  "suggested": {
    "meaningZh": "听；听取；被告知；知道（谦让表达）",
    "chineseSenses": [
      "听；听取；被告知；知道（谦让表达）",
      "接受（订单、预约等）；领受；应允；承办（谦让表达）"
    ]
  }
}
```

依据：https://kotobank.jp/jeword/%E6%89%BF%E3%82%8B；本地 JMdict 条目 1349440。

## 167. 拝む（おがむ） / lex:openjlpt:0a5c26a710

类别：clarification；理由：主译仅鞠躬不足以区别お辞儀；主英文为worship/beg，例句为瞻仰/见识。

```json
{
  "original": {
    "meaningZh": "鞠躬",
    "chineseSenses": [
      "鞠躬",
      "（双手合十）祈祷",
      "见识"
    ]
  },
  "suggested": {
    "meaningZh": "合掌祈祷；参拜；膜拜",
    "chineseSenses": [
      "合掌祈祷；参拜；膜拜",
      "恳求；央求",
      "拜见；瞻仰；见识（敬意或戏谑语气）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1472230。

## 176. おさきに（おさきに） / lex:openjlpt:b1173f76cf

类别：clarification；理由：保留时间义，同时使主释义匹配お先に的常用礼貌表达与例句。

```json
{
  "original": {
    "meaningZh": "之前；以前",
    "chineseSenses": [
      "之前；以前",
      "前面；在前"
    ]
  },
  "suggested": {
    "meaningZh": "先；在前；先行（如“您先请”“我先走了”）",
    "chineseSenses": [
      "先；在前；先行（如“您先请”“我先走了”）",
      "先前；以前（依语境）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1002280。

## 231. 改造（かいぞう） / lex:openjlpt:aca1f9b63b

类别：correction；理由：整理不能表达建筑或车辆结构改造。

```json
{
  "original": {
    "meaningZh": "整理",
    "chineseSenses": [
      "整理",
      "重組，改組",
      "修改/破解遊戲數值"
    ]
  },
  "suggested": {
    "meaningZh": "改造；改建；改装；改组",
    "chineseSenses": [
      "改造；改建；改装；改组",
      "修改（如游戏模组、设备功能）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1201000。

## 266. 火口（かこう） / lex:openjlpt:a2e9a76dd2

类别：clarification；理由：かこう也确实有锅炉燃烧口义，不判原读音错误；补主要火山义。

```json
{
  "original": {
    "meaningZh": "（锅炉的）燃烧器",
    "chineseSenses": [
      "（锅炉的）燃烧器"
    ]
  },
  "suggested": {
    "meaningZh": "火山口；喷火口",
    "chineseSenses": [
      "火山口；喷火口",
      "（锅炉等的）燃烧口"
    ]
  }
}
```

依据：https://www.jma.go.jp/jma/kishou/know/kazan/kazanyougo/chikei.html；https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1193860。

## 266. 火口（かこう） / lex:openjlpt:a2e9a76dd2

类别：correction；理由：补火山义；origin of a fire混入ひぐち/火元的解释。

```json
{
  "original": {
    "meaningEn": [
      "a burner",
      "origin of a fire"
    ]
  },
  "suggested": {
    "meaningEn": [
      "volcanic crater",
      "burner (of a boiler)"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1193860。

## 296. 学級（がっきゅう） / lex:openjlpt:9ceaaec557

类别：correction；理由：学級是班级，grade易误为学年。

```json
{
  "original": {
    "meaningEn": [
      "grade in school"
    ]
  },
  "suggested": {
    "meaningEn": [
      "school class"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1206680。

## 308. 加熱（かねつ） / lex:openjlpt:65bbe081e9

类别：correction；理由：加热与保持温度（保温）不同。

```json
{
  "original": {
    "meaningZh": "保持溫度",
    "chineseSenses": [
      "保持溫度"
    ]
  },
  "suggested": {
    "meaningZh": "加热；施加热量",
    "chineseSenses": [
      "加热；施加热量"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1190470。

## 339. 感ずる（かんずる） / lex:openjlpt:391e4f541a

类别：correction；理由：原中文字段只有日语同义词，没有中文释义。

```json
{
  "original": {
    "meaningZh": "感じる",
    "chineseSenses": [
      "感じる"
    ]
  },
  "suggested": {
    "meaningZh": "感觉；感到；感受（同感じる）",
    "chineseSenses": [
      "感觉；感到；感受（同感じる）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1609650。

## 425. 工夫（くふう） / lex:openjlpt:5f2c3ba54c

类别：correction；理由：くふう是构思/想办法，labourer/worker属于另一读法こうふ。

```json
{
  "original": {
    "meaningEn": [
      "labourer",
      "worker"
    ]
  },
  "suggested": {
    "meaningEn": [
      "devising a way",
      "ingenuity",
      "idea",
      "plan"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1278220。

## 437. 郡（ぐん） / lex:openjlpt:988eff8e12

类别：correction；理由：country误为国家，郡对应county/district。

```json
{
  "original": {
    "meaningEn": [
      "country",
      "district"
    ]
  },
  "suggested": {
    "meaningEn": [
      "district",
      "county"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1249230。

## 469. 険しい（けわしい） / lex:openjlpt:7f5f5e5428

类别：correction；理由：原英文名词短语inaccessible place/sharp eyes未准确表达形容词义。

```json
{
  "original": {
    "meaningEn": [
      "inaccessible place",
      "sharp eyes"
    ]
  },
  "suggested": {
    "meaningEn": [
      "steep",
      "rugged",
      "precipitous",
      "stern",
      "grim"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1260530。

## 516. 後輩（こうはい） / lex:openjlpt:c6a40ed583

类别：correction；理由：“下班同学”为明显错字/错误释义。

```json
{
  "original": {
    "meaningZh": "后辈，晚辈",
    "chineseSenses": [
      "后辈，晚辈",
      "下班同学，比自己晚的校友"
    ]
  },
  "suggested": {
    "meaningZh": "后辈；晚辈；资历较浅者",
    "chineseSenses": [
      "后辈；晚辈；资历较浅者",
      "后入学的学生；低年级同学；较晚入校的校友"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1270010。

## 590. さきおととい（さきおととい） / lex:openjlpt:eee75b5abd

类别：correction；理由：前天的前天为四天前，与三天前矛盾。

```json
{
  "original": {
    "meaningZh": "前天的前天；三天前",
    "chineseSenses": [
      "前天的前天；三天前"
    ]
  },
  "suggested": {
    "meaningZh": "大前天；三天前",
    "chineseSenses": [
      "大前天；三天前"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1576030。

## 600. 刺さる（ささる） / lex:openjlpt:d69e3e87d9

类别：correction；理由：原主释义刺出/突出把方向反了。

```json
{
  "original": {
    "meaningZh": "刺出，穿出，突出",
    "chineseSenses": [
      "刺出，穿出，突出",
      "刺入",
      "深深感动，震动"
    ]
  },
  "suggested": {
    "meaningZh": "刺入；扎入；插进；扎在里面",
    "chineseSenses": [
      "刺入；扎入；插进；扎在里面",
      "打动；引起情感共鸣（比喻）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1306390。

## 610. 流石（さすが） / lex:openjlpt:46ba179deb

类别：correction；理由：“同上”是词典跳转残片，不能作释义。

```json
{
  "original": {
    "meaningZh": "同上。",
    "chineseSenses": [
      "同上。"
    ]
  },
  "suggested": {
    "meaningZh": "不愧是；果然；正如所料",
    "chineseSenses": [
      "不愧是；果然；正如所料",
      "毕竟；到底；即使是（依语境）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1552390。

## 631. しあさって（しあさって） / lex:openjlpt:b589376271

类别：correction；理由：后天的后天为四天后；本条标准语和两例均为三天后。

```json
{
  "original": {
    "meaningZh": "三天后；后天的后天",
    "chineseSenses": [
      "三天后；后天的后天"
    ]
  },
  "suggested": {
    "meaningZh": "大后天；三天后",
    "chineseSenses": [
      "大后天；三天后"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1594050。

## 638. 司会（しかい） / lex:openjlpt:aa5973a2fb

类别：clarification；理由：主席只指人，缺少司会する的主持义；完整说明其活动与角色义。

```json
{
  "original": {
    "meaningZh": "主席",
    "chineseSenses": [
      "主席",
      "司儀；主持人"
    ]
  },
  "suggested": {
    "meaningZh": "主持（会议、仪式等）",
    "chineseSenses": [
      "主持（会议、仪式等）",
      "主持人；司仪；会议主席"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1306640。

## 649. 四捨五入（ししゃごにゅう） / lex:openjlpt:855762ebcc

类别：correction；理由：四舍五入包含舍去和进位，不能只说rounding up。

```json
{
  "original": {
    "meaningEn": [
      "rounding up (fractions)"
    ]
  },
  "suggested": {
    "meaningEn": [
      "rounding off a number"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1307250。

## 663. しつこい（しつこい） / lex:openjlpt:bef1949982

类别：correction；理由：移除附加义项しつこいさ；名词应是しつこさ，不能作为中文释义。

```json
{
  "original": {
    "meaningZh": "纠缠不休，粘缠。",
    "chineseSenses": [
      "纠缠不休，粘缠。",
      "(色、香、味等)浓艳，腻人。",
      "しつこいさ"
    ]
  },
  "suggested": {
    "meaningZh": "纠缠不休；执拗；不依不饶",
    "chineseSenses": [
      "纠缠不休；执拗；不依不饶",
      "（味道等）浓厚；油腻；过于浓重"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1005550。

## 688. 締め切る（しめきる） / lex:openjlpt:8e6aa9eafb

类别：clarification；理由：现有例句为停止接单；仅关闭/上锁会误教主要用途。

```json
{
  "original": {
    "meaningZh": "关闭；上锁",
    "chineseSenses": [
      "关闭；上锁"
    ]
  },
  "suggested": {
    "meaningZh": "截止；停止受理（报名、申请等）",
    "chineseSenses": [
      "截止；停止受理（报名、申请等）",
      "关严；封闭"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1594600。

## 688. 締め切る（しめきる） / lex:openjlpt:8e6aa9eafb

类别：clarification；理由：补例句对应的截止/停止受理义。

```json
{
  "original": {
    "meaningEn": [
      "to shut up"
    ]
  },
  "suggested": {
    "meaningEn": [
      "to close up",
      "to close off",
      "to set a deadline",
      "to stop accepting applications or orders"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1594600。

## 723. 縮小（しゅくしょう） / lex:openjlpt:dbb718ab22

类别：correction；理由：浓缩是濃縮，縮小表达尺寸或规模减少。

```json
{
  "original": {
    "meaningZh": "濃縮",
    "chineseSenses": [
      "濃縮",
      "縮短",
      "減少，縮減"
    ]
  },
  "suggested": {
    "meaningZh": "缩小；缩减；削减",
    "chineseSenses": [
      "缩小；缩减；削减"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1337630。

## 795. 人文科学（じんぶんかがく） / lex:openjlpt:ef02a97b60

类别：correction；理由：人文科学区别于社会科学，不以social sciences作为本条释义。

```json
{
  "original": {
    "meaningEn": [
      "social sciences",
      "humanities"
    ]
  },
  "suggested": {
    "meaningEn": [
      "humanities",
      "arts"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1369140。

## 839. 素直（すなお） / lex:openjlpt:4c23dad704

类别：clarification；理由：温和不足以表达例句的坦率/坦诚义，补关键用法。

```json
{
  "original": {
    "meaningZh": "溫和",
    "chineseSenses": [
      "溫和",
      "順從"
    ]
  },
  "suggested": {
    "meaningZh": "顺从；坦率；不做作",
    "chineseSenses": [
      "顺从；坦率；不做作",
      "直率地表达感情；老实听取意见"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1397340。

## 841. スピーカー（スピーカー） / lex:openjlpt:9ece254a41

类别：correction；理由：附加义项“话筒”是microphone，不是speaker；把例句所用扬声器义置前。

```json
{
  "original": {
    "meaningZh": "说话人",
    "chineseSenses": [
      "说话人",
      "扬声器",
      "话筒"
    ]
  },
  "suggested": {
    "meaningZh": "扬声器；扩音器",
    "chineseSenses": [
      "扬声器；扩音器",
      "演讲者；说话者",
      "爱传播消息的人（比喻）"
    ]
  }
}
```

依据：https://kotobank.jp/word/%E3%81%99%E3%81%B4%E3%83%BC%E3%81%8B%E3%83%BC-3156594；本地 JMdict 条目 1072240。

## 863. 清書（せいしょ） / lex:openjlpt:dbd84cdab0

类别：correction；理由：誉写/誉改误用了誉；意为写出整洁的清稿。

```json
{
  "original": {
    "meaningZh": "誉写，誉改。",
    "chineseSenses": [
      "誉写，誉改。"
    ]
  },
  "suggested": {
    "meaningZh": "誊写；誊清",
    "chineseSenses": [
      "誊写；誊清"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1378240。

## 873. 成分（せいぶん） / lex:openjlpt:649455971d

类别：correction；理由：附加中文“实体”不是该条英文ingredient/component/composition的适当对应。

```json
{
  "original": {
    "meaningZh": "構成物體的元素、物質、因素",
    "chineseSenses": [
      "構成物體的元素、物質、因素",
      "實體"
    ]
  },
  "suggested": {
    "meaningZh": "成分；组成部分；成分构成",
    "chineseSenses": [
      "成分；组成部分；成分构成"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1375860。

## 891. せめて（せめて） / lex:openjlpt:5b1670aea6

类别：correction；理由：本条假名せめて和例句为程度副词，但关联到名词攻め手，主中英文均错。

```json
{
  "original": {
    "meaningZh": "进攻；攻击方法",
    "chineseSenses": [
      "进攻；攻击方法"
    ]
  },
  "suggested": {
    "meaningZh": "至少；起码（表达最低限度的愿望）",
    "chineseSenses": [
      "至少；起码（表达最低限度的愿望）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1675160。

## 891. せめて（せめて） / lex:openjlpt:5b1670aea6

类别：correction；理由：改回副词せめて的JMdict条目，避免后续同步重新引入攻め手义项。

```json
{
  "original": {
    "meaningEn": [
      "offense",
      "method of attack"
    ],
    "pos": [
      "n"
    ],
    "jmdictId": 1675160
  },
  "suggested": {
    "meaningEn": [
      "at least",
      "at the very least"
    ],
    "pos": [
      "adv"
    ],
    "jmdictId": 1006570
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1675160。

## 916. 相互（そうご） / lex:openjlpt:434ce23ca6

类别：correction；理由：附加“交替”不对应mutual/reciprocal。

```json
{
  "original": {
    "meaningZh": "互相",
    "chineseSenses": [
      "互相",
      "交替"
    ]
  },
  "suggested": {
    "meaningZh": "相互；互相；彼此",
    "chineseSenses": [
      "相互；互相；彼此"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1596370。

## 999. ダム（ダム） / lex:openjlpt:34b4191f3c

类别：correction；理由：dumb是错误英文；现有例句明确水坝。

```json
{
  "original": {
    "meaningEn": [
      "dumb"
    ]
  },
  "suggested": {
    "meaningEn": [
      "dam"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1077140。

## 1050. 長男（ちょうなん） / lex:openjlpt:1eeb6f9a04

类别：correction；理由：長男不隐含嫡出身份，删去嫡长子。

```json
{
  "original": {
    "meaningZh": "长男；长子；嫡长子",
    "chineseSenses": [
      "长男；长子；嫡长子"
    ]
  },
  "suggested": {
    "meaningZh": "长子；最大的儿子（也可能是独子）",
    "chineseSenses": [
      "长子；最大的儿子（也可能是独子）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1430080。

## 1058. 直流（ちょくりゅう） / lex:openjlpt:b27701113c

类别：correction；理由：本条英文DC对应电学义，原主中文只匹配字面河流描述。

```json
{
  "original": {
    "meaningZh": "（河流）直着流",
    "chineseSenses": [
      "（河流）直着流",
      "直流"
    ]
  },
  "suggested": {
    "meaningZh": "直流电；直流",
    "chineseSenses": [
      "直流电；直流"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1431600。

## 1075. 通用（つうよう） / lex:openjlpt:da7eee9d6c

类别：clarification；理由：“共同使用”容易误为共同所有/共用，补出通用/有效的本义。

```json
{
  "original": {
    "meaningZh": "共同使用",
    "chineseSenses": [
      "共同使用"
    ]
  },
  "suggested": {
    "meaningZh": "通用；流通；有效",
    "chineseSenses": [
      "通用；流通；有效",
      "行得通；被接受；适用"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1433570。

## 1088. 努める（つとめる） / lex:openjlpt:ad4ecf843d

类别：correction；理由：努める是努力；现有英文为勤める/務める的同音词义。

```json
{
  "original": {
    "meaningEn": [
      "to serve",
      "to fill a post",
      "to serve under",
      "to work (for)"
    ]
  },
  "suggested": {
    "meaningEn": [
      "to make an effort",
      "to strive",
      "to endeavor"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1240820。

## 1121. 出来上がる（できあがる） / lex:openjlpt:1a5cce10d7

类别：correction；理由：自动词出来上がる是某物完成/准备好，不是执行任务或履行承诺。

```json
{
  "original": {
    "meaningZh": "完成的，執行（任務）/履行（承諾）",
    "chineseSenses": [
      "完成的，執行（任務）/履行（承諾）",
      "去完成，去做，去準備",
      "過度飲酒；喝醉，酒酣"
    ]
  },
  "suggested": {
    "meaningZh": "完成；做好；准备就绪",
    "chineseSenses": [
      "完成；做好；准备就绪",
      "喝得酩酊大醉（口语）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1340610。

## 1121. 出来上がる（できあがる） / lex:openjlpt:1a5cce10d7

类别：correction；理由：by definition不是出来上がる的义项。

```json
{
  "original": {
    "meaningEn": [
      "to be finished",
      "to be ready",
      "by definition",
      "to be very drunk"
    ]
  },
  "suggested": {
    "meaningEn": [
      "to be completed",
      "to be finished",
      "to be ready",
      "to be very drunk"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1340610。

## 1158. 統計（とうけい） / lex:openjlpt:b4e3b45b3f

类别：correction；理由：統計不是scattering/dispersion。

```json
{
  "original": {
    "meaningEn": [
      "scattering",
      "a scatter",
      "dispersion"
    ]
  },
  "suggested": {
    "meaningEn": [
      "statistics"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1449710。

## 1212. 永い（ながい） / lex:openjlpt:7137e5312a

类别：correction；理由：永い主要表时间；距离长应写長い。

```json
{
  "original": {
    "meaningZh": "长；距离长",
    "chineseSenses": [
      "长；距离长",
      "长；冗长；拖沓"
    ]
  },
  "suggested": {
    "meaningZh": "（时间）长；长久；漫长",
    "chineseSenses": [
      "（时间）长；长久；漫长"
    ]
  }
}
```

依据：https://kotobank.jp/word/%E9%95%B7%E3%81%84-587550；https://www.kanjipedia.jp/kotoba/0000382900；本地 JMdict 条目 1429750。

## 1220. 亡くす（なくす） / lex:openjlpt:972c45f9d5

类别：correction；理由：亡くす是他动词失去某人，不是本人死亡（亡くなる）。

```json
{
  "original": {
    "meaningZh": "丧，死。",
    "chineseSenses": [
      "丧，死。"
    ]
  },
  "suggested": {
    "meaningZh": "因死亡而失去（亲人等）；丧失亲人",
    "chineseSenses": [
      "因死亡而失去（亲人等）；丧失亲人"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 2835808。

## 1229. 何分（なにぶん） / lex:openjlpt:4067523091

类别：clarification；理由：数量义本身存在；主释义补本条例句与现代常见副词用法。

```json
{
  "original": {
    "meaningZh": "某些；某种；有些；一点",
    "chineseSenses": [
      "某些；某种；有些；一点",
      "无论如何；总之；毕竟；反正"
    ]
  },
  "suggested": {
    "meaningZh": "毕竟；无论如何；总之（说明情况或请求体谅）",
    "chineseSenses": [
      "毕竟；无论如何；总之（说明情况或请求体谅）",
      "些许；若干；一点（依语境）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1189310。

## 1257. 女房（にょうぼう） / lex:openjlpt:1bec520d49

类别：correction；理由：英语wife和两例都指妻子；现代广义女佣人的说明会误导。

```json
{
  "original": {
    "meaningZh": "侍女，宫女；(现代广义) 女佣人",
    "chineseSenses": [
      "侍女，宫女；(现代广义) 女佣人",
      "女友，女爱人，女情人",
      "(狭义) 妻子，内人，老婆 （现代用法中倾向于做谦称，一般不用来指别人的妻子）"
    ]
  },
  "suggested": {
    "meaningZh": "妻子；老婆（多指自己的妻子，较口语）",
    "chineseSenses": [
      "妻子；老婆（多指自己的妻子，较口语）",
      "宫廷女官；女侍（历史用语）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1345420。

## 1274. 濃度（のうど） / lex:openjlpt:b321aa2d85

类别：clarification；理由：附加单字“势”缺少数学标签，需明确cardinality。

```json
{
  "original": {
    "meaningZh": "表示溶液的溶質與溶劑間的相對量",
    "chineseSenses": [
      "表示溶液的溶質與溶劑間的相對量",
      "勢"
    ]
  },
  "suggested": {
    "meaningZh": "浓度；密度",
    "chineseSenses": [
      "浓度；密度",
      "基数；集合的势（数学）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1469970。

## 1313. 外れる（はずれる） / lex:openjlpt:440987e433

类别：correction；理由：外れる为自动词，附加脱掉/取下易混为他动词外す。

```json
{
  "original": {
    "meaningZh": "解開，打開",
    "chineseSenses": [
      "解開，打開",
      "脫掉；取下",
      "脱轨，偏离",
      "猜错",
      "違反"
    ]
  },
  "suggested": {
    "meaningZh": "脱落；脱开；掉下来；偏离",
    "chineseSenses": [
      "脱落；脱开；掉下来；偏离",
      "落空；猜错；未中",
      "被排除；不符合；违背"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1203310。

## 1324. 派手（はで） / lex:openjlpt:fa217abd55

类别：correction；理由：原中文仅有派手的注音转写，未提供意思。

```json
{
  "original": {
    "meaningZh": "派(は)手(で) (hade)",
    "chineseSenses": [
      "派(は)手(で) (hade)"
    ]
  },
  "suggested": {
    "meaningZh": "花哨；鲜艳夺目；华丽；张扬",
    "chineseSenses": [
      "花哨；鲜艳夺目；华丽；张扬"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1471140。

## 1389. 日日（ひにち） / lex:openjlpt:50b6055d9b

类别：correction；理由：日日读ひにち时当前中译与两例是日期/天数；原英文daily来自ひび/にちにち的另一常用读法。

```json
{
  "original": {
    "meaningEn": [
      "every day",
      "daily",
      "day after day"
    ]
  },
  "suggested": {
    "meaningEn": [
      "date",
      "day",
      "number of days"
    ]
  }
}
```

依据：https://kotobank.jp/jeword/%E6%97%A5%E6%97%A5；本地 JMdict 条目 1611370。

## 1404. 平仮名（ひらがな） / lex:openjlpt:5fc011d141

类别：correction；理由：删除无依据的47 syllables数量，避免把假名数量和音节混为一谈。

```json
{
  "original": {
    "meaningEn": [
      "hiragana",
      "47 syllables",
      "the cursive syllabary"
    ]
  },
  "suggested": {
    "meaningEn": [
      "hiragana",
      "the cursive Japanese syllabary"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1507090。

## 1425. 複写（ふくしゃ） / lex:openjlpt:da73d5aa2c

类别：correction；理由：誉写为誊写之误，整理为本词稳定译义。

```json
{
  "original": {
    "meaningZh": "1. (书画等)复制，翻拍。；2. 复写，誉写。",
    "chineseSenses": [
      "1. (书画等)复制，翻拍。；2. 复写，誉写。"
    ]
  },
  "suggested": {
    "meaningZh": "复制；复印；复写；翻拍",
    "chineseSenses": [
      "复制；复印；复写；翻拍"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1501390。

## 1447. ぶつぶつ（ぶつぶつ） / lex:openjlpt:826de86dee

类别：clarification；理由：切小块义确实存在；应把英文和例句的抱怨、疙瘩义补齐。

```json
{
  "original": {
    "meaningZh": "切成小块",
    "chineseSenses": [
      "切成小块"
    ]
  },
  "suggested": {
    "meaningZh": "嘟囔；小声抱怨；嘀咕",
    "chineseSenses": [
      "嘟囔；小声抱怨；嘀咕",
      "疙瘩；小疹子",
      "切成小块（ぶつぶつ切る等搭配）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1011200。

## 1472. 文献（ぶんけん） / lex:openjlpt:606f11e5c2

类别：correction；理由：literature此处指文献，不是文学这一学科。

```json
{
  "original": {
    "meaningZh": "文學",
    "chineseSenses": [
      "文學",
      "文獻，文件"
    ]
  },
  "suggested": {
    "meaningZh": "文献；参考资料；书面资料",
    "chineseSenses": [
      "文献；参考资料；书面资料"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1505330。

## 1476. 分布（ぶんぷ） / lex:openjlpt:65b1441da3

类别：correction；理由：分布是存在的位置/范围，不能误译成主动分配。

```json
{
  "original": {
    "meaningZh": "分配",
    "chineseSenses": [
      "分配"
    ]
  },
  "suggested": {
    "meaningZh": "分布；散布于",
    "chineseSenses": [
      "分布；散布于"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1504160。

## 1490. 隔てる（へだてる） / lex:openjlpt:a2d96b6d4b

类别：correction；理由：隔てる为他动词，不是to be shut out被拒之门外。

```json
{
  "original": {
    "meaningEn": [
      "to be shut out"
    ]
  },
  "suggested": {
    "meaningEn": [
      "to separate",
      "to divide",
      "to partition",
      "to interpose"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1206360。

## 1531. 盆地（ぼんち） / lex:openjlpt:20d7554878

类别：correction；理由：中文字段残留英文basin，补为可确定中文。

```json
{
  "original": {
    "meaningZh": "basin",
    "chineseSenses": [
      "basin"
    ]
  },
  "suggested": {
    "meaningZh": "盆地",
    "chineseSenses": [
      "盆地"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1523760。

## 1550. 交ぜる（まぜる） / lex:openjlpt:bfe15d1832

类别：correction；理由：交ぜる为他动词；原英文被动/自动表达混同交じる。

```json
{
  "original": {
    "meaningEn": [
      "to be mixed",
      "to be blended with"
    ]
  },
  "suggested": {
    "meaningEn": [
      "to mix",
      "to blend",
      "to stir"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1290310。

## 1582. みじめ（みじめ） / lex:openjlpt:06f8dff15d

类别：correction；理由：みじめ是现代常用词，删除无依据archaic标签。

```json
{
  "original": {
    "meaningEn": [
      "(archaic) sad",
      "pitiful",
      "wretched"
    ]
  },
  "suggested": {
    "meaningEn": [
      "miserable",
      "wretched",
      "unhappy",
      "pitiful"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1303280。

## 1610. 姪（めい） / lex:openjlpt:0b3f7b2cf0

类别：correction；理由：姪包括姐妹的女儿，原定义只提兄弟而漏外甥女。

```json
{
  "original": {
    "meaningZh": "兄弟的女兒",
    "chineseSenses": [
      "兄弟的女兒"
    ]
  },
  "suggested": {
    "meaningZh": "侄女；外甥女（兄弟姐妹的女儿）",
    "chineseSenses": [
      "侄女；外甥女（兄弟姐妹的女儿）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1532940。

## 1630. めでたい（めでたい） / lex:openjlpt:561a981d4b

类别：correction；理由：现有附加说明把おめでたい说成恭维善良，会误解讽刺语气。

```json
{
  "original": {
    "meaningZh": "值得恭贺，可庆可喜，可喜可贺的。",
    "chineseSenses": [
      "值得恭贺，可庆可喜，可喜可贺的。",
      "（某事物）進行得很順利",
      "（受上位者）讚揚和喜愛（以「覚えがめでたい」的形式出現）",
      "（恭維）善良、好的（以「おめでたい」的形式出現）"
    ]
  },
  "suggested": {
    "meaningZh": "值得庆贺；可喜；吉祥",
    "chineseSenses": [
      "值得庆贺；可喜；吉祥",
      "天真得可笑；过于乐观（常用おめでたい，带讽刺）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1608630。

## 1679. 家主（やぬし） / lex:openjlpt:7b3793ce89

类别：clarification；理由：一家之主义存在；主释义改与landlord和两条例句对应。

```json
{
  "original": {
    "meaningZh": "一家之主，家長",
    "chineseSenses": [
      "一家之主，家長",
      "房主，房东"
    ]
  },
  "suggested": {
    "meaningZh": "房东；房屋所有者",
    "chineseSenses": [
      "房东；房屋所有者",
      "一家之主（依语境）"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1191990。

## 1694. 輸血（ゆけつ） / lex:openjlpt:2da7613dd3

类别：correction；理由：“一种治疗措施”过于泛化，不能帮助识别blood transfusion。

```json
{
  "original": {
    "meaningZh": "一種治療措施",
    "chineseSenses": [
      "一種治療措施"
    ]
  },
  "suggested": {
    "meaningZh": "输血",
    "chineseSenses": [
      "输血"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1538810。

## 1769. 湧く（わく） / lex:openjlpt:3b96c00a5b

类别：correction；理由：湧く的涌现义应与沸く的沸腾分开；移除boil/grow hot。

```json
{
  "original": {
    "meaningEn": [
      "to boil",
      "to grow hot",
      "to get excited",
      "to gush forth"
    ]
  },
  "suggested": {
    "meaningEn": [
      "to gush out",
      "to well up",
      "to arise",
      "to emerge"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1606685。

## 143. 遠足（えんそく） / lex:openjlpt:75fef7ef0d

类别：editorial；理由：去除词典词性/章节标记残留，不改变词义。

```json
{
  "original": {
    "meaningZh": "サ 野游，郊游。",
    "chineseSenses": [
      "サ 野游，郊游。"
    ]
  },
  "suggested": {
    "meaningZh": "野游，郊游。",
    "chineseSenses": [
      "野游，郊游。"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1178260。

## 232. 開通（かいつう） / lex:openjlpt:c85140bde0

类别：editorial；理由：去除词典词性/章节标记残留，不改变词义。

```json
{
  "original": {
    "meaningZh": "通车，通话。==日语==",
    "chineseSenses": [
      "通车，通话。==日语=="
    ]
  },
  "suggested": {
    "meaningZh": "通车，通话。",
    "chineseSenses": [
      "通车，通话。"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1202850。

## 256. 拡張（かくちょう） / lex:openjlpt:7f59e7581c

类别：editorial；理由：去除词典词性/章节标记残留，不改变词义。

```json
{
  "original": {
    "meaningZh": "扩张，扩充。==日语==",
    "chineseSenses": [
      "扩张，扩充。==日语=="
    ]
  },
  "suggested": {
    "meaningZh": "扩张，扩充。",
    "chineseSenses": [
      "扩张，扩充。"
    ]
  }
}
```

依据：https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-10-07；本地 JMdict 条目 1205220。

## 不应误改的词条

- 火口：同读法确有锅炉燃烧口义；本次仅补火山口主义，不改读音。
- 日日：这是成立的较少见写法，不能强改ひび；只对齐英文。
- 若々しい：国语辞典确载未成熟义，不能据现代常用义删除。
- 紙幣：纸花/祭祀纸饰物在历史词典中确有别义（常读しべい），本次不将其自动判为无中生有。
- 毛皮：けがわ也可作皮部的部首名，不能仅凭日常词义删除。
- 琴：JMdict也载中国筝义，本次不因词形历史/俗称差异强改。
- 四つ角：JMdict同时载四角和十字路口义，不将前者自动判错。

## 限制

- 本次没有试听任何词汇音频。
- 全部词形、假名与中英文释义已读，但并未人工审读全部词汇例句；仅疑点条目例句已核对。
- 报告不改APP、不改原PDF、不改HTML；主任务需把接受的meaningZh订正与chineseSenses同步。
- 资料含有效的罕见/古义，不因罕见即删除；仍不能保证其他细微语义完全无误。
