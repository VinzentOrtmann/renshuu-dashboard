/**
 * Building the kanji course: school-grade order, split into levels, with each
 * kanji broken into the components it's built from.
 *
 * Pure — the generator script (scripts/course.ts) does the downloading, and the
 * rules here are unit tested in courseData.test.ts.
 *
 * Sources, both from the Electronic Dictionary Research and Development Group
 * and licensed CC BY-SA 4.0:
 *   - KANJIDIC2 for meanings, readings, school grade and newspaper frequency.
 *   - KRADFILE for which components each kanji contains.
 *
 * The component-first idea is WaniKani's; the content is not. Its radical
 * names, mnemonics and level order are its own, so components here take their
 * standard dictionary names and levels follow the Japanese school curriculum.
 */

/** Bumped only if the course shape changes incompatibly. */
export const COURSE_VERSION = 1

/** Kanji per level. WaniKani's levels run to a similar size. */
export const LEVEL_SIZE = 30

/**
 * KRADFILE's stand-in characters.
 *
 * KRADFILE predates Unicode's radical forms, so it writes some components as a
 * whole kanji that contains them: 化 means the person radical 亻, 汁 the water
 * radical 氵. Taken literally they'd be labelled with the stand-in's own
 * meaning — 化 "change", 汁 "soup" — which is wrong in exactly the place the
 * course is meant to teach. Each maps to the form actually written, and a name.
 */
export const STAND_INS: Record<string, { form: string; name: string }> = {
  化: { form: '亻', name: 'person' },
  汁: { form: '氵', name: 'water' },
  扎: { form: '扌', name: 'hand' },
  并: { form: '丷', name: 'horns' },
  艾: { form: '艹', name: 'grass' },
  个: { form: '𠆢', name: 'hat' },
  込: { form: '辶', name: 'road' },
  刈: { form: '刂', name: 'knife' },
  尚: { form: '⺌', name: 'small (top)' },
  乞: { form: '𠂉', name: 'person (top)' },
  阡: { form: '阝', name: 'mound (left side)' },
  邦: { form: '阝', name: 'village (right side)' },
  忙: { form: '忄', name: 'heart (side)' },
  杰: { form: '灬', name: 'fire (bottom)' },
  買: { form: '罒', name: 'net' },
  疔: { form: '疒', name: 'sickness' },
  老: { form: '耂', name: 'old (top)' },
  犯: { form: '犭', name: 'beast' },
  礼: { form: '礻', name: 'spirit (side)' },
  初: { form: '衤', name: 'clothing (side)' },
  禹: { form: '禸', name: 'track' },
  滴: { form: '啇', name: 'root' },
}

/**
 * Names for components where the dictionary has none, or one that describes
 * the character's use as a word rather than as a building block — 厶 is listed
 * as "I", 艮 as "northeast". Standard radical names, not invented ones.
 */
export const COMPONENT_NAMES: Record<string, string> = {
  // No dictionary entry: shapes rather than characters.
  '｜': 'stick',
  ノ: 'slash',
  ユ: 'U-shape',
  ハ: 'fins',
  ヨ: 'rake',
  マ: 'ma',
  // Dictionary meaning doesn't fit the component.
  亠: 'lid',
  冖: 'cover',
  宀: 'roof',
  丶: 'dot',
  亅: 'hook',
  厶: 'private',
  儿: 'legs',
  勹: 'wrap',
  冂: 'head box',
  厂: 'cliff',
  广: 'building',
  卩: 'seal',
  冫: 'ice',
  彳: 'step',
  攵: 'strike',
  廾: 'two hands',
  凵: 'open box',
  匚: 'box on side',
  囗: 'enclosure',
  夂: 'winter',
  殳: 'weapon',
  疋: 'bolt of cloth',
  廴: 'stretch',
  虍: 'tiger',
  歹: 'death',
  弋: 'ceremony',
  爿: 'split wood',
  癶: 'footsteps',
  隶: 'slave',
  釆: 'divide',
  舛: 'opposite',
  屮: 'sprout',
  豸: 'badger',
  巛: 'river',
  鬲: 'cauldron',
  气: 'steam',
  彑: 'snout',
  尢: 'lame',
  爻: 'cross',
  髟: 'long hair',
  鬯: 'herbs',
  艮: 'stopping',
  豕: 'pig',
  幺: 'short thread',
  隹: 'old bird',
  戈: 'halberd',
  匕: 'spoon',
  斤: 'axe',
  卜: 'divination',
  禾: 'grain',
  亡: 'lost',
  已: 'already',
  乙: 'second',
  士: 'samurai',
  臣: 'retainer',
  而: 'beard',
  乃: 'from',
  又: 'again',
}

/** Parses KRADFILE text into kanji -> components, as listed. */
export function parseKradfile(text: string): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [kanji, parts] = line.split(' : ')
    if (!kanji || !parts) continue
    result.set(kanji.trim(), parts.trim().split(/\s+/))
  }
  return result
}

/**
 * The components a kanji is directly built from.
 *
 * KRADFILE lists every level of the breakdown at once: 緊 is given as 糸 幺 小
 * 臣 又, though 幺 and 小 are simply what 糸 is made of. WaniKani-style lessons
 * show the direct parts — 糸, 臣, 又 — so a part is dropped when another listed
 * part contains it.
 *
 * Two parts can each be listed inside the other — 母 and its variant 毋 — which
 * would drop both. Of such a pair, the one that's a kanji in the course is
 * kept, as the more recognisable of the two.
 */
export function directParts(
  kanji: string,
  krad: Map<string, string[]>,
  courseKanji: Set<string>,
): string[] {
  const parts = krad.get(kanji) ?? []
  const contains = (outer: string, inner: string) =>
    (krad.get(outer) ?? []).includes(inner)

  return parts.filter((part) => {
    for (const other of parts) {
      if (other === part || !contains(other, part)) continue
      // `other` contains `part`. A one-way containment means part is nested.
      if (!contains(part, other)) return false
      // Mutual: keep only the course kanji, or the first listed if neither is.
      const partInCourse = courseKanji.has(part)
      const otherInCourse = courseKanji.has(other)
      if (otherInCourse && !partInCourse) return false
      if (partInCourse === otherInCourse && parts.indexOf(other) < parts.indexOf(part)) {
        return false
      }
    }
    return true
  })
}

/** One kanji in the course. */
export interface CourseKanji {
  c: string
  level: number
  grade: number
  /** Stroke count. */
  s: number
  /** English meanings, the first few, comma separated. */
  m: string
  on: string
  kun: string
  /** Component ids, in KRADFILE order. */
  parts: string[]
}

/** One component. `id` is KRADFILE's character; `form` is what is written. */
export interface CourseComponent {
  id: string
  form: string
  name: string
  level: number
}

export interface CourseLevel {
  /** Components first introduced at this level. */
  components: string[]
  kanji: string[]
}

/** The top level of public/data/course.json. */
export interface Course {
  version: number
  generatedAt: string
  levels: CourseLevel[]
  kanji: Record<string, CourseKanji>
  components: Record<string, CourseComponent>
}

/** The KANJIDIC2 fields the course needs. */
export interface KanjidicCourseEntry {
  c: string
  grade?: number
  /** Newspaper frequency rank, 1 = most common. Absent for rare kanji. */
  freq?: number
  s: number
  m: string
  on: string
  kun: string
}

/** Reads the course fields out of one KANJIDIC2 `<character>` block. */
export function parseCourseEntry(block: string): KanjidicCourseEntry | null {
  const literal = /<literal>([^<]+)<\/literal>/.exec(block)?.[1]
  if (!literal) return null
  const all = (pattern: RegExp) =>
    [...block.matchAll(pattern)].map((m) =>
      m[1].trim().replace(/&amp;/g, '&'),
    )
  const grade = /<grade>(\d+)<\/grade>/.exec(block)?.[1]
  const freq = /<freq>(\d+)<\/freq>/.exec(block)?.[1]
  return {
    c: literal,
    grade: grade ? Number(grade) : undefined,
    freq: freq ? Number(freq) : undefined,
    s: Number(/<stroke_count>(\d+)<\/stroke_count>/.exec(block)?.[1] ?? 0),
    m: all(/<meaning>([^<]+)<\/meaning>/g).slice(0, 3).join(', '),
    on: all(/<reading r_type="ja_on">([^<]+)<\/reading>/g).slice(0, 3).join(', '),
    kun: all(/<reading r_type="ja_kun">([^<]+)<\/reading>/g).slice(0, 3).join(', '),
  }
}

/**
 * The jōyō kanji in teaching order: school grade 1 to 6, then the secondary-
 * school set (KANJIDIC2 grade 8). Within a grade, most common first by
 * newspaper frequency, so each level front-loads the kanji you'll meet most;
 * kanji with no frequency rank go last, fewest strokes first.
 */
export function orderCourse(entries: KanjidicCourseEntry[]): KanjidicCourseEntry[] {
  return entries
    .filter((e) => e.grade !== undefined && e.grade <= 8)
    .sort(
      (a, b) =>
        a.grade! - b.grade! ||
        (a.freq ?? Infinity) - (b.freq ?? Infinity) ||
        a.s - b.s ||
        a.c.localeCompare(b.c),
    )
}

/** Name for a component, from the tables above or the dictionary. */
function componentName(
  id: string,
  dictionary: Map<string, KanjidicCourseEntry>,
): string {
  return (
    STAND_INS[id]?.name ??
    COMPONENT_NAMES[id] ??
    dictionary.get(id)?.m.split(',')[0]?.trim() ??
    id
  )
}

/** Builds the whole course from KANJIDIC2 entries and KRADFILE. */
export function buildCourse(
  entries: KanjidicCourseEntry[],
  krad: Map<string, string[]>,
  levelSize: number = LEVEL_SIZE,
): Course {
  const dictionary = new Map(entries.map((e) => [e.c, e]))
  const ordered = orderCourse(entries)
  const courseKanji = new Set(ordered.map((e) => e.c))

  const levels: CourseLevel[] = []
  const kanji: Record<string, CourseKanji> = {}
  const components: Record<string, CourseComponent> = {}

  ordered.forEach((entry, index) => {
    const level = Math.floor(index / levelSize) + 1
    levels[level - 1] ??= { components: [], kanji: [] }
    const parts = directParts(entry.c, krad, courseKanji)

    // A component is introduced at the first level that needs it.
    for (const part of parts) {
      if (components[part]) continue
      components[part] = {
        id: part,
        form: STAND_INS[part]?.form ?? part,
        name: componentName(part, dictionary),
        level,
      }
      levels[level - 1].components.push(part)
    }

    levels[level - 1].kanji.push(entry.c)
    kanji[entry.c] = {
      c: entry.c,
      level,
      grade: entry.grade!,
      s: entry.s,
      m: entry.m,
      on: entry.on,
      kun: entry.kun,
      parts,
    }
  })

  return {
    version: COURSE_VERSION,
    generatedAt: new Date().toISOString(),
    levels,
    kanji,
    components,
  }
}
