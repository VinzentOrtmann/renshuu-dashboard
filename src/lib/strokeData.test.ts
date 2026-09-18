/**
 * Tests for the KanjiVG stroke parser and bucketing.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bucketFor, parseKanjiVgStrokes } from './strokeData.ts'

describe('bucketFor', () => {
  it('groups by 256-code-point block', () => {
    assert.equal(bucketFor('飛'), '98') // U+98DB
    assert.equal(bucketFor('あ'), '30') // U+3042
  })

  it('handles characters outside the Basic Multilingual Plane', () => {
    assert.equal(bucketFor('𠮟'), '20b') // U+20B9F
  })
})

describe('parseKanjiVgStrokes', () => {
  it('returns strokes in stroke order, whatever the document order', () => {
    const svg = `
      <g id="kvg:StrokePaths_04e8c">
        <g><path id="kvg:04e8c-s2" kvg:type="㇐" d="M2,2"/></g>
        <path id="kvg:04e8c-s1" kvg:type="㇐" d="M1,1"/>
      </g>`
    assert.deepEqual(parseKanjiVgStrokes(svg), ['M1,1', 'M2,2'])
  })

  it('does not care about attribute order', () => {
    const svg = '<path d="M9,9" kvg:type="㇑" id="kvg:05341-s1"/>'
    assert.deepEqual(parseKanjiVgStrokes(svg), ['M9,9'])
  })

  it('sorts numerically, so stroke 10 comes after stroke 9', () => {
    const svg = [11, 10, 9, 2, 1]
      .map((n) => `<path id="kvg:x-s${n}" d="M${n},0"/>`)
      .join('')
    assert.deepEqual(parseKanjiVgStrokes(svg), [
      'M1,0',
      'M2,0',
      'M9,0',
      'M10,0',
      'M11,0',
    ])
  })

  it('ignores paths that are not strokes', () => {
    assert.deepEqual(parseKanjiVgStrokes('<path id="other" d="M0,0"/>'), [])
  })
})
