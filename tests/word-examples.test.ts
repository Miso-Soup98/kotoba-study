import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { vocabulary } from "../lib/study/content.ts";
import { findWordExamples } from "../lib/study/word-examples.ts";
import type { Entry, Example, Word } from "../lib/study/types.ts";

const entries: Entry[] = JSON.parse(
  readFileSync("public/data/grammar.json", "utf8"),
).entries;
const entry = (id: string) => entries.find((e) => e.id === id)!;
const word = (id: string, text: string) =>
  vocabulary(entry(id)).find((w) => w.text === text)!;
const example = (japanese: string, japanese_annotated = japanese): Example => ({
  japanese,
  japanese_annotated,
  japanese_reading: "",
  chinese: "测试例句",
});
function fixture(
  text: string,
  reading: string,
  examples: Example[],
): { source: Entry; word: Word } {
  const source = { ...entry("N5-002"), id: "TEST", examples };
  return {
    source,
    word: {
      id: "word:TEST:0",
      text,
      reading,
      meaning: "测试义项",
      source: "TEST",
      original: text,
    },
  };
}

test("食べる links to 食べます in the second N5-002 sentence, never the unrelated first sentence", () => {
  const source = entry("N5-002"),
    before = JSON.stringify(source);
  assert.deepEqual(findWordExamples(word(source.id, "食べる"), source), [
    source.examples[1],
  ]);
  assert.strictEqual(
    findWordExamples(word(source.id, "食べる"), source)[0],
    source.examples[1],
  );
  assert.deepEqual(findWordExamples(word(source.id, "勉強する"), source), [
    source.examples[0],
  ]);
  assert.equal(JSON.stringify(source), before);
  assert.equal(word(source.id, "食べる").id, "word:N5-002:5");
});

test("polite, negative and te/aspect forms keep their source sentence association", () => {
  for (const [id, text, index] of [
    ["N5-003", "来る", 0],
    ["N5-003", "降る", 1],
    ["N5-009", "帰る", 1],
    ["N5-015", "出る", 1],
    ["N5-028", "結婚する", 1],
    ["N5-070", "勉強する", 0],
  ] as const) {
    const source = entry(id);
    assert.deepEqual(
      findWordExamples(word(id, text), source),
      [source.examples[index]],
      `${id} ${text}`,
    );
  }
});

test("all relevant sentences are returned once, in original order", () => {
  const source = entry("N5-012");
  assert.deepEqual(
    findWordExamples(word(source.id, "ある"), source),
    source.examples,
  );
  assert.deepEqual(
    findWordExamples(word("N5-002", "食べる"), entry("N5-002")).length,
    1,
  );
});

test("unknown or absent vocabulary has no fabricated first-example fallback", () => {
  assert.deepEqual(
    findWordExamples(word("N5-007", "はい"), entry("N5-007")),
    [],
  );
  assert.deepEqual(
    findWordExamples(word("N5-007", "いいえ"), entry("N5-007")),
    [],
  );
  assert.deepEqual(
    findWordExamples(word("N3-038", "全員"), entry("N3-038")),
    [],
  );
  assert.deepEqual(findWordExamples(word("N5-002", "食べる"), undefined), []);
  assert.deepEqual(
    findWordExamples(word("N5-002", "食べる"), entry("N5-003")),
    [],
  );
  const unknown = fixture("いわゆる", "いわゆる", [
    example("いわゆりました。"),
  ]);
  assert.deepEqual(findWordExamples(unknown.word, unknown.source), []);
});

test("a later valid occurrence is found without matching 本 inside 日本語", () => {
  const f = fixture("本", "ほん", [
    example("日本語です。", "日本語（にほんご）です。"),
    example("日本語の本です。", "日本語（にほんご）の本（ほん）です。"),
  ]);
  assert.deepEqual(findWordExamples(f.word, f.source), [f.source.examples[1]]);
  assert.equal(
    findWordExamples(word("N4-007", "本"), entry("N4-007")).length,
    1,
  );
});

test("annotation reading and complete loanword boundaries prevent false substring matches", () => {
  const homograph = fixture("入れる", "いれる", [
    example("入れます。", "入（はい）れます。"),
  ]);
  assert.deepEqual(findWordExamples(homograph.word, homograph.source), []);
  const loanword = fixture("パン", "パン", [
    example("パンツを買います。"),
    example("パンを買います。"),
  ]);
  assert.deepEqual(findWordExamples(loanword.word, loanword.source), [
    loanword.source.examples[1],
  ]);
  const incomplete = fixture("食べる", "たべる", [
    example("食べ物です。", "食（た）べ物（もの）です。"),
  ]);
  assert.deepEqual(findWordExamples(incomplete.word, incomplete.source), []);
});

test("reviewed polysemous words cannot reuse an association after their sense changes", () => {
  const source = entry("N2-006"),
    original = word(source.id, "起きる");
  assert.deepEqual(findWordExamples(original, source), [source.examples[0]]);
  assert.deepEqual(
    findWordExamples({ ...original, meaning: "起床" }, source),
    [],
  );
  assert.deepEqual(
    findWordExamples({ ...original, id: "word:N2-006:99" }, source),
    [],
  );
  const ask = entry("N5-072"),
    askWord = word(ask.id, "聞く");
  assert.deepEqual(findWordExamples(askWord, ask), [ask.examples[0]]);
  assert.deepEqual(
    findWordExamples({ ...askWord, meaning: "听音乐" }, ask),
    [],
  );
  assert.deepEqual(
    findWordExamples(askWord, {
      ...ask,
      examples: [
        example("音楽を聞きます。", "音楽（おんがく）を聞（き）きます。"),
      ],
    }),
    [],
  );
});

test("real glossary senses exclude ついさっき and copular でございます", () => {
  const unintentional = entry("N3-147"),
    existence = entry("N4-093");
  assert.deepEqual(
    findWordExamples(word(unintentional.id, "つい"), unintentional),
    [unintentional.examples[0]],
  );
  assert.deepEqual(
    findWordExamples(word(unintentional.id, "ついさっき"), unintentional),
    [unintentional.examples[1]],
  );
  assert.deepEqual(
    findWordExamples(word(existence.id, "ございます"), existence),
    [existence.examples[0]],
  );
});

test("changed or incomplete annotations do not trigger approximate phonetic guessing", () => {
  const f = fixture("食べる", "たべる", [
    example("食べます。", "飲（の）みます。"),
  ]);
  assert.deepEqual(findWordExamples(f.word, f.source), []);
});

test("full-corpus associations preserve all source objects and stable word IDs", () => {
  const before = JSON.stringify(entries);
  let count = 0;
  for (const source of entries) {
    for (const w of vocabulary(source)) {
      count++;
      const result = findWordExamples(w, source);
      assert.equal(new Set(result).size, result.length, w.id);
      assert.deepEqual(
        result,
        source.examples.filter((ex) => result.includes(ex)),
        w.id,
      );
    }
  }
  assert.equal(count, 2496);
  assert.equal(JSON.stringify(entries), before);
});
