import type { Entry, Example, Word } from "./types";

type Form = { text: string; reading: string };
type AnnotatedPart = {
  start: number;
  end: number;
  text: string;
  reading?: string;
};
type ParsedExample = {
  text: string;
  parts: AnnotatedPart[];
  starts: Set<number>;
  ends: Set<number>;
};

const segmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("ja", { granularity: "word" })
    : null;
const parsedExamples = new WeakMap<Example, ParsedExample | null>();
const han = /[\p{Script=Han}々]/u;

// These kana-only verbs are explicit entries, not a guess that every word ending
// in る/く/etc. is a verb (e.g. いわゆる or よく). Kanji verbs use a restricted set
// of complete inflected forms; a bare stem is never used as a search term.
const kanaVerbs = new Set([
  "ある",
  "する",
  "くる",
  "くれる",
  "もらう",
  "できる",
  "つく",
  "やむ",
  "ぬれる",
  "かなう",
  "いらっしゃる",
  "くださる",
  "いただく",
  "やめる",
  "かねる",
  "かまう",
  "つながる",
  "あふれる",
  "やる",
  "なくす",
]);
const godanRuEndings = [
  "帰る",
  "走る",
  "入る",
  "切る",
  "知る",
  "限る",
  "滑る",
  "要る",
  "減る",
];
const godan: Record<string, [string, string, string, string, string, string]> =
  {
    // a / i / e / o rows; te / ta forms
    う: ["わ", "い", "え", "お", "って", "った"],
    く: ["か", "き", "け", "こ", "いて", "いた"],
    ぐ: ["が", "ぎ", "げ", "ご", "いで", "いだ"],
    す: ["さ", "し", "せ", "そ", "して", "した"],
    つ: ["た", "ち", "て", "と", "って", "った"],
    ぬ: ["な", "に", "ね", "の", "んで", "んだ"],
    ぶ: ["ば", "び", "べ", "ぼ", "んで", "んだ"],
    む: ["ま", "み", "め", "も", "んで", "んだ"],
    る: ["ら", "り", "れ", "ろ", "って", "った"],
  };

function forms(word: Word): Form[] {
  const result: Form[] = [{ text: word.text, reading: word.reading }];
  if (/[〜～／/]/u.test(word.text)) return result;
  const add = (text: string, reading: string) => result.push({ text, reading });
  const suffixes = (text: string, reading: string, endings: string[]) =>
    endings.forEach((ending) => add(text + ending, reading + ending));
  const polite = ["ます", "ました", "ません", "ませんでした", "ましょう"];
  const stemEndings = [
    ...polite,
    "たい",
    "たく",
    "たかった",
    "たくない",
    "ながら",
    "に",
  ];
  const negative = ["ない", "なかった", "なく", "なくて", "なければ"];
  const teEndings = [
    "",
    "いる",
    "いた",
    "いない",
    "います",
    "いました",
    "いません",
    "いませんでした",
    "くれる",
    "くれました",
    "ください",
    "いただけません",
    "いきます",
  ];
  const participles = (
    text: string,
    reading: string,
    te: string,
    ta: string,
  ) => {
    suffixes(text + te, reading + te, teEndings);
    suffixes(text + ta, reading + ta, ["", "ら", "り", "ん"]);
  };

  if (word.text.endsWith("する")) {
    const t = word.text.slice(0, -2),
      r = word.reading.slice(0, -2);
    suffixes(t + "し", r + "し", [
      ...stemEndings,
      ...negative,
      "て",
      "た",
      "よう",
    ]);
    add(t + "すれば", r + "すれば");
    participles(t + "し", r + "し", "て", "た");
  } else if (
    (word.text.endsWith("来る") || word.text.endsWith("くる")) &&
    word.reading.endsWith("くる")
  ) {
    const kanji = word.text.endsWith("来る");
    const t = word.text.slice(0, -2),
      r = word.reading.slice(0, -2);
    suffixes(t + (kanji ? "来" : "き"), r + "き", [
      ...polite,
      "ながら",
      "たい",
    ]);
    suffixes(t + (kanji ? "来" : "こ"), r + "こ", [...negative, "よう"]);
    add(t + (kanji ? "来れば" : "くれば"), r + "くれば");
    participles(t + (kanji ? "来" : "き"), r + "き", "て", "た");
  } else if (han.test(word.text) || kanaVerbs.has(word.text)) {
    const t = word.text.slice(0, -1),
      r = word.reading.slice(0, -1);
    if (word.text.endsWith("い")) {
      suffixes(t, r, [
        "く",
        "くて",
        "かった",
        "くない",
        "くなかった",
        "くありません",
        "ければ",
      ]);
    } else if (
      word.text.endsWith("る") &&
      /[いきぎしじちぢにひびぴみりえけげせぜてでねへべぺめれ]る$/u.test(
        word.reading,
      ) &&
      !godanRuEndings.some((ending) => word.text.endsWith(ending))
    ) {
      suffixes(t, r, [...stemEndings, ...negative, "て", "た", "れば", "よう"]);
      participles(t, r, "て", "た");
    } else {
      const row = godan[word.text.at(-1) ?? ""];
      if (row) {
        const [a, i, e, o, te, ta] = row;
        const honorific = ["くださる", "いらっしゃる"].includes(word.text);
        suffixes(
          t + (honorific ? "い" : i),
          r + (honorific ? "い" : i),
          stemEndings,
        );
        suffixes(t + a, r + a, negative);
        suffixes(t, r, [e + "ば", o + "う"]);
        const iku = word.text.endsWith("行く");
        participles(t, r, iku ? "って" : te, iku ? "った" : ta);
      }
    }
  }
  return result;
}

function parse(example: Example): ParsedExample | null {
  if (parsedExamples.has(example)) return parsedExamples.get(example)!;
  const parts: AnnotatedPart[] = [];
  let text = "",
    last = 0;
  const push = (surface: string, reading?: string) => {
    if (!surface) return;
    parts.push({
      start: text.length,
      end: text.length + surface.length,
      text: surface,
      reading,
    });
    text += surface;
  };
  for (const match of example.japanese_annotated.matchAll(
    /([\p{Script=Han}々]+)（([^）]+)）/gu,
  )) {
    push(example.japanese_annotated.slice(last, match.index));
    push(match[1], match[2]);
    last = match.index + match[0].length;
  }
  push(example.japanese_annotated.slice(last));
  // Do not search a reading at some unrelated place in the sentence, or align
  // annotations approximately. Missing support/evidence means no automatic link.
  if (!segmenter || text !== example.japanese) {
    parsedExamples.set(example, null);
    return null;
  }
  const starts = new Set<number>(),
    ends = new Set<number>();
  for (const part of segmenter.segment(text)) {
    starts.add(part.index);
    ends.add(part.index + part.segment.length);
  }
  const parsed = { text, parts, starts, ends };
  parsedExamples.set(example, parsed);
  return parsed;
}

function readingAt(
  parsed: ParsedExample,
  start: number,
  end: number,
): string | null {
  let reading = "";
  for (const part of parsed.parts) {
    if (part.end <= start || part.start >= end) continue;
    if (part.reading !== undefined) {
      // 本 inside 日本語, or 人 inside 三人, is not evidence for the source word.
      if (part.start < start || part.end > end) return null;
      reading += part.reading;
    } else {
      reading += part.text.slice(
        Math.max(start - part.start, 0),
        end - part.start,
      );
    }
  }
  return reading;
}

function matches(example: Example, candidates: Form[]): boolean {
  const parsed = parse(example);
  if (!parsed) return false;
  return candidates.some((candidate) => {
    if (!candidate.text) return false;
    for (
      let at = parsed.text.indexOf(candidate.text);
      at !== -1;
      at = parsed.text.indexOf(candidate.text, at + 1)
    ) {
      const end = at + candidate.text.length;
      // An entire annotated noun is also a reliable boundary when the segmenter
      // groups it with a particle (七時に / と同時に / 実際は).
      const annotatedNoun =
        /^[\p{Script=Han}々]+$/u.test(candidate.text) &&
        parsed.parts.some(
          (part) =>
            part.reading !== undefined && part.start === at && part.end === end,
        );
      if (
        (annotatedNoun || (parsed.starts.has(at) && parsed.ends.has(end))) &&
        readingAt(parsed, at, end) === candidate.reading
      )
        return true;
    }
    return false;
  });
}

// Same spelling/reading can have a different sense. These few reviewed links
// are guarded by the original word meaning AND exact original sentence, so a
// later textbook edit or a different word ID cannot silently reuse the decision.
const senseSensitive = new Set([
  "起きる",
  "聞く",
  "開く",
  "かかる",
  "つい",
  "ございます",
]);
const reviewed: Record<
  string,
  { text: string; reading: string; meaning: string; sentences: string[] }
> = {
  "word:N3-147:3": {
    text: "つい",
    reading: "つい",
    meaning: "不由得",
    sentences: ["おいしくて、つい食べすぎました。"],
  },
  "word:N4-093:3": {
    text: "ございます",
    reading: "ございます",
    meaning: "有的郑重表达",
    sentences: ["質問はございますか。"],
  },
  "word:N5-008:1": {
    text: "起きる",
    reading: "おきる",
    meaning: "起床",
    sentences: ["七時に起きます。"],
  },
  "word:N5-037:1": {
    text: "起きる",
    reading: "おきる",
    meaning: "起床",
    sentences: ["明日は早く起きなくてもいいです。"],
  },
  "word:N5-075:3": {
    text: "起きる",
    reading: "おきる",
    meaning: "起床",
    sentences: ["いつも七時に起きます。"],
  },
  "word:N4-010:3": {
    text: "起きる",
    reading: "おきる",
    meaning: "起床",
    sentences: ["日曜日なのに、早く起きました。"],
  },
  "word:N3-129:2": {
    text: "起きる",
    reading: "おきる",
    meaning: "起床",
    sentences: ["早く起きるのに慣れていません。"],
  },
  "word:N2-006:1": {
    text: "起きる",
    reading: "おきる",
    meaning: "发生",
    sentences: ["この問題は日本に限らず、各国で起きています。"],
  },
  "word:N2-034:2": {
    text: "起きる",
    reading: "おきる",
    meaning: "发生",
    sentences: ["事故は起きないに越したことはありません。"],
  },
  "word:N5-061:1": {
    text: "聞く",
    reading: "きく",
    meaning: "听",
    sentences: ["音楽を聞くのが好きです。"],
  },
  "word:N5-072:2": {
    text: "聞く",
    reading: "きく",
    meaning: "问",
    sentences: ["分からないことは、何でも聞いてください。"],
  },
  "word:N4-018:2": {
    text: "聞く",
    reading: "きく",
    meaning: "问、听",
    sentences: ["先生に聞いてみます。"],
  },
  "word:N4-086:3": {
    text: "聞く",
    reading: "きく",
    meaning: "听、问",
    sentences: ["店は日曜日に休むと聞きました。"],
  },
  "word:N4-123:2": {
    text: "聞く",
    reading: "きく",
    meaning: "听",
    sentences: ["その話をぜひ聞きたいです。"],
  },
  "word:N3-030:3": {
    text: "聞く",
    reading: "きく",
    meaning: "询问",
    sentences: ["先生に聞いてからでなければ、決められません。"],
  },
  "word:N3-095:1": {
    text: "聞く",
    reading: "きく",
    meaning: "询问",
    sentences: ["分からないときは、先生に聞けばいいです。"],
  },
  "word:N2-148:0": {
    text: "聞く",
    reading: "きく",
    meaning: "问",
    sentences: ["先生に聞いたところ、明日は休講だそうです。"],
  },
  "word:N2-206:2": {
    text: "聞く",
    reading: "きく",
    meaning: "听",
    sentences: ["まず、私の話を聞きたまえ。"],
  },
  "word:N4-054:0": {
    text: "開く",
    reading: "あく",
    meaning: "开、开启〔自动词〕",
    sentences: ["窓が開きました。"],
  },
  "word:N3-083:0": {
    text: "開く",
    reading: "ひらく",
    meaning: "举办、召开",
    sentences: ["会議は東京において開かれました。"],
  },
  "word:N3-087:3": {
    text: "開く",
    reading: "ひらく",
    meaning: "召开",
    sentences: ["留学生向けに説明会を開きます。"],
  },
  "word:N3-177:0": {
    text: "開く",
    reading: "あく",
    meaning: "开门",
    sentences: ["明日も店は開きません。つまり、二日間休みです。"],
  },
  "word:N2-062:3": {
    text: "開く",
    reading: "ひらく",
    meaning: "开办",
    sentences: ["苦労の末に、店を開きました。"],
  },
  "word:N5-082:1": {
    text: "かかる",
    reading: "かかる",
    meaning: "花费（时间、金钱）",
    sentences: ["駅まで十分ぐらいかかります。"],
  },
  "word:N4-083:3": {
    text: "かかる",
    reading: "かかる",
    meaning: "花费时间或金钱",
    sentences: ["駅まで歩くのに二十分かかります。"],
  },
  "word:N3-166:1": {
    text: "かかる",
    reading: "かかる",
    meaning: "花费",
    sentences: ["駅まで三十分はかかります。"],
  },
  "word:N2-094:3": {
    text: "かかる",
    reading: "かかる",
    meaning: "花费",
    sentences: ["費用が高いのみならず、時間もかかります。"],
  },
};

/**
 * Return original examples from this word's source entry, in textbook order.
 * This is a conservative display-only association, not a semantic or pronunciation
 * review. No arbitrary first-example fallback, cross-entry lookup, or ID rewrite.
 */
export function findWordExamples(
  word: Word,
  source: Entry | undefined,
): Example[] {
  if (!source || source.id !== word.source) return [];
  if (senseSensitive.has(word.text)) {
    const approval = reviewed[word.id];
    if (
      !approval ||
      approval.text !== word.text ||
      approval.reading !== word.reading ||
      approval.meaning !== word.meaning
    )
      return [];
    return source.examples.filter((example) =>
      approval.sentences.includes(example.japanese),
    );
  }
  const candidates = forms(word);
  return source.examples.filter((example) => matches(example, candidates));
}
