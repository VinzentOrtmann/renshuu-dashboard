/**
 * Checking typed review answers.
 *
 * Two jobs: decide whether a typed meaning matches, and whether a typed
 * reading matches. Readings may be typed as kana or as romaji — without this,
 * answering would need an IME switched on for every review — so both sides are
 * reduced to a plain romaji form and compared there.
 *
 * Deliberately forgiving: this is self-study, and refusing "kyu" for きゅう or
 * "resting" for "rest" would only train typing accuracy.
 */

/** Base kana syllables, hiragana only; katakana is folded onto these first. */
const KANA: Record<string, string> = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  さ: 'sa',
  し: 'shi',
  す: 'su',
  せ: 'se',
  そ: 'so',
  ざ: 'za',
  じ: 'ji',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  た: 'ta',
  ち: 'chi',
  つ: 'tsu',
  て: 'te',
  と: 'to',
  だ: 'da',
  ぢ: 'ji',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'fu',
  へ: 'he',
  ほ: 'ho',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  ゐ: 'wi',
  ゑ: 'we',
  を: 'o',
  ん: 'n',
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
}

/** Consonant kept before a small ya/yu/yo: きゃ is kya, not ki-ya. */
const DIGRAPH_BASE: Record<string, string> = {
  shi: 'sh',
  chi: 'ch',
  ji: 'j',
}

/** Katakana to hiragana, so only one table is needed. */
function toHiragana(kana: string): string {
  return kana.replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  )
}

/** Kana to plain romaji. Anything that isn't kana is passed through. */
export function kanaToRomaji(kana: string): string {
  const text = toHiragana(kana)
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (char === 'っ') {
      // Small tsu doubles the next consonant: がっこう is gakkou.
      const next = KANA[toHiragana(text[i + 1] ?? '')] ?? ''
      out += next.slice(0, 1)
      continue
    }
    if (char === 'ー') {
      // Long mark repeats the previous vowel; length is normalised away later.
      out += out.slice(-1)
      continue
    }

    const syllable = KANA[char]
    if (syllable === undefined) {
      out += char
      continue
    }

    const small = KANA[text[i + 1] ?? '']
    if (
      (text[i + 1] === 'ゃ' || text[i + 1] === 'ゅ' || text[i + 1] === 'ょ') &&
      small !== undefined
    ) {
      const base = DIGRAPH_BASE[syllable] ?? syllable.slice(0, -1) + 'y'
      out += base + small.slice(-1)
      i++
      continue
    }
    out += syllable
  }
  return out
}

/**
 * One spelling for comparison: lower case, letters only, the common romaji
 * systems folded together (si/shi, tu/tsu), and long vowels collapsed, so
 * "kyuu", "kyu" and "きゅう" all end up the same.
 */
export function normaliseRomaji(text: string): string {
  let out = text.toLowerCase().replace(/[^a-z぀-ヿ一-鿿]/g, '')
  if (/[぀-ヿ]/.test(out)) out = kanaToRomaji(out)
  out = out
    .replace(/sy/g, 'sh')
    .replace(/ty/g, 'ch')
    .replace(/[zdj]y/g, 'j')
    .replace(/si/g, 'shi')
    .replace(/ti/g, 'chi')
    .replace(/tu/g, 'tsu')
    .replace(/hu/g, 'fu')
    .replace(/zi/g, 'ji')
    .replace(/di/g, 'ji')
    .replace(/du/g, 'zu')
    .replace(/nn/g, 'n')
    .replace(/ou/g, 'o')
    .replace(/([aiueo])\1/g, '$1')
  return out
}

/**
 * The readings of a kanji as separate answers.
 *
 * KANJIDIC marks okurigana with a dot (やす.む) and suffix readings with a
 * hyphen (-ぐさ). Both the stem alone and the whole word count as right: what
 * is being tested is the reading, not where the word ends.
 */
export function readingAnswers(readings: string): string[] {
  const answers: string[] = []
  for (const raw of readings.split(',')) {
    const reading = raw.trim().replace(/-/g, '')
    if (!reading) continue
    answers.push(reading.replace(/\./g, ''))
    if (reading.includes('.')) answers.push(reading.split('.')[0])
  }
  return [...new Set(answers)]
}

/** The meanings of an item as separate answers. */
export function meaningAnswers(meanings: string): string[] {
  return meanings
    .split(',')
    .map((m) =>
      m
        .replace(/\([^)]*\)/g, '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
}

/**
 * Edit distance, counting a swap of two neighbours as one edit: "retier" for
 * "retire" is one slip of the fingers, not two.
 */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  const rows = [Array.from({ length: b.length + 1 }, (_, j) => j)]
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(
        rows[i - 1][j] + 1,
        row[j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2][j - 2] + 1)
      }
      row[j] = best
    }
    rows.push(row)
  }
  return rows[a.length][b.length]
}

/** How close a typed answer is: right, a typo away, or wrong. */
export type Verdict = 'yes' | 'close' | 'no'

/** How much misspelling to forgive: little in short words, more in long ones. */
function allowedTypos(answer: string): number {
  if (answer.length < 4) return 0
  return answer.length < 8 ? 1 : 2
}

/** Same letters, different order: "dya" for "day" — a slip, not another word. */
function sameLetters(a: string, b: string): boolean {
  return (
    a.length === b.length && [...a].sort().join('') === [...b].sort().join('')
  )
}

/**
 * Checks a typed meaning. Plurals and a trailing "to " are ignored, so
 * "to rest" and "days off" pass for "rest" and "day off".
 */
export function checkMeaning(typed: string, meanings: string): Verdict {
  const clean = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/^to\s+/, '')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/s$/, '')
  const answer = clean(typed)
  if (!answer) return 'no'

  let verdict: Verdict = 'no'
  for (const meaning of meaningAnswers(meanings)) {
    const target = clean(meaning)
    if (answer === target) return 'yes'
    const slips = distance(answer, target)
    if (
      slips <= allowedTypos(target) ||
      (slips <= 1 && sameLetters(answer, target))
    ) {
      verdict = 'close'
    }
  }
  return verdict
}

/**
 * Checks a typed reading against every on and kun reading. Readings are exact
 * or wrong: there is no near-miss, since a wrong kana is a wrong reading.
 */
export function checkReading(typed: string, ...readings: string[]): Verdict {
  const answer = normaliseRomaji(typed)
  if (!answer) return 'no'
  for (const list of readings) {
    for (const reading of readingAnswers(list)) {
      if (normaliseRomaji(reading) === answer) return 'yes'
    }
  }
  return 'no'
}
