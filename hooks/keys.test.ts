import { describe, expect, test } from 'claude-code/testing'

import { keyHint, ringVerdict } from './keys'
import type { Rules } from './keys'

const rules: Rules = { keys: 'keys', own: new Set(['play', 'handoff', 'jump', 'keys']), ttlMs: 60000 }
const held = { ring: 'keys', at: 1000, now: 2000 }

describe('what a move of the focus ring means', () => {
  test('landing on the key field is the game holding the keys', () => {
    expect(ringVerdict({ origin: 'plugin', isOwn: true, element: 'keys' }, { ring: '', at: 0, now: 0 }, rules)).toBe('confirm')
    expect(ringVerdict({ origin: 'person', isOwn: true, element: 'keys' }, held, rules)).toBe('confirm')
  })

  test('an arrow or Tab off the field onto the band controls is a key', () => {
    for (const element of ['play', 'jump', 'handoff']) {
      expect(ringVerdict({ origin: 'person', isOwn: true, element }, held, rules)).toBe('jump')
    }
  })

  test('the plugin moving the ring itself is never a key', () => {
    expect(ringVerdict({ origin: 'plugin', isOwn: true, element: 'play' }, held, rules)).toBe('pass')
  })

  test('the engine\'s own stops, another plugin\'s elements and a ring the game never held are the person\'s', () => {
    // Esc and the way out must never be trapped
    expect(ringVerdict({ origin: 'person', isOwn: false, element: undefined }, held, rules)).toBe('leave')
    expect(ringVerdict({ origin: 'person', isOwn: false, element: 'play' }, held, rules)).toBe('leave')
    expect(ringVerdict({ origin: 'person', isOwn: true, element: 'play' }, { ring: '', at: 0, now: 5 }, rules)).toBe('leave')
  })

  test('a ring the game last held long ago is not read as a key', () => {
    expect(ringVerdict({ origin: 'person', isOwn: true, element: 'play' }, { ring: 'keys', at: 0, now: 61000 }, rules)).toBe('leave')
    expect(ringVerdict({ origin: 'person', isOwn: true, element: 'play' }, { ring: 'keys', at: 0, now: 59000 }, rules)).toBe('jump')
  })
})

describe('the hint on the guidance line', () => {
  test('says what to do, in the order that matters', () => {
    expect(keyHint('live', false)).toBe('any key')
    expect(keyHint('wait', false)).toBe('any key')
    expect(keyHint('click', false)).toBe('click here, then any key')
    expect(keyHint('live', true)).toBe('any key · esc to type')
    // a refused keyboard matters more than a finished turn
    expect(keyHint('click', true)).toBe('click here, then any key')
  })
})
