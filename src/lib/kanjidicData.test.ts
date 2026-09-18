/**
 * Tests for the KANJIDIC2 parser, against a trimmed copy of a real entry.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseKanjidic, parseKanjidicCharacter } from './kanjidicData.ts'

const KIN = `
<literal>緊</literal>
<codepoint><cp_value cp_type="ucs">7dca</cp_value></codepoint>
<misc><grade>8</grade><stroke_count>15</stroke_count><freq>1225</freq><jlpt>1</jlpt></misc>
<reading_meaning><rmgroup>
<reading r_type="pinyin">jin3</reading>
<reading r_type="ja_on">キン</reading>
<reading r_type="ja_kun">しめ.る</reading>
<reading r_type="ja_kun">し.める</reading>
<meaning>tense</meaning>
<meaning>solid</meaning>
<meaning>hard</meaning>
<meaning>reliable</meaning>
<meaning>tight</meaning>
<meaning m_lang="fr">tendu</meaning>
<meaning m_lang="es">tenso</meaning>
</rmgroup></reading_meaning>`

describe('parseKanjidicCharacter', () => {
  it('reads the literal, stroke count, readings and English meanings', () => {
    assert.deepEqual(parseKanjidicCharacter(KIN), {
      c: '緊',
      s: 15,
      m: 'tense, solid, hard, reliable',
      on: 'キン',
      kun: 'しめ.る, し.める',
    })
  })

  it('ignores meanings in other languages', () => {
    assert.doesNotMatch(parseKanjidicCharacter(KIN)?.m ?? '', /tendu|tenso/)
  })

  it('ignores Chinese readings', () => {
    assert.doesNotMatch(parseKanjidicCharacter(KIN)?.on ?? '', /jin/)
  })

  it('decodes XML entities', () => {
    const entry = parseKanjidicCharacter(
      '<literal>丈</literal><meaning>length &amp; height</meaning>',
    )
    assert.equal(entry?.m, 'length & height')
  })

  it('returns null without a literal', () => {
    assert.equal(parseKanjidicCharacter('<meaning>x</meaning>'), null)
  })
})

describe('parseKanjidic', () => {
  it('reads every character and skips ones with no English meaning', () => {
    const xml = `<kanjidic2>
      <character>${KIN}</character>
      <character><literal>𠀋</literal><meaning m_lang="fr">x</meaning></character>
    </kanjidic2>`
    const entries = parseKanjidic(xml)
    assert.deepEqual(
      entries.map((e) => e.c),
      ['緊'],
    )
  })
})
