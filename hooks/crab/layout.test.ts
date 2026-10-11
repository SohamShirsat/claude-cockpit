import { describe, expect, test } from 'claude-code/testing'

import { deskConfigFor, deskQuiet, FIELD, fresh, HINT_RUNS, lookFor, NOTES } from './game'
import type { Game } from './game'
import { motionSvg, sceneSvg, SCENE } from './scene'

// The desktop band: a short line of keys above the picture, and a picture whose top corner holds the
// whole scoreboard so the crab's jump has clear air. Texts the picture says (a first-sight note,
// GAME OVER) go in the clear top row between the crab and the scoreboard.

const WIDTHS = [FIELD.min, FIELD.normal, FIELD.max] as const
const SIZE = { width: 840, height: 144 }
const HUD_FROM = (w: number) => w - 6 - 122
const CRAB_CLEAR = 80 // right of the crab (x 36, 30 wide) and its jump

const game = (width: number, mode: Game['mode'], extra: Partial<Game> = {}): Game => {
  const cfg = deskConfigFor(width)

  return { ...fresh(377, 3, mode, lookFor('plain'), cfg), score: 123.4, grabbed: 7, fixed: 3, ...extra }
}
const draw = (g: Game, width: number) => sceneSvg(g, deskConfigFor(width), SIZE)
const texts = (svg: string, cls: string) =>
  [...svg.matchAll(new RegExp(`<text class="${cls}[^"]*" x="([\\d.]+)" y="([\\d.]+)"[^>]*>(?:<[^>]*>)*([^<]*)</text>`, 'g'))].map(m => ({ x: Number(m[1]), y: Number(m[2]), text: m[3] ?? '' }))

describe('the key hint of the first game', () => {
  const hinted = (g: Game, width: number) => motionSvg({ states: [g], phase: 0, hints: true }, deskConfigFor(width), SIZE)
  const hintOf = (svg: string) => texts(svg, 'bn').filter(t => t.text.includes('J duck'))

  for (const width of WIDTHS) {
    test(`at ${width} units wide it sits right-aligned under the best score, clear of the crab's side`, () => {
      const g = game(width, 'play')
      const [hint] = hintOf(hinted(g, width))
      expect(hint).toBeDefined()
      expect(hint?.text).toBe('J duck · K jump')
      // under the scoreboard's row (y 9), at the right edge
      expect(hint?.y).toBeGreaterThan(9)
      // with a clear row of air between it and the best score (the text is 7 units tall)
      expect((hint?.y ?? 0) - 9).toBeGreaterThanOrEqual(16)
      expect(hint?.x).toBeGreaterThan(width - 10)
      // its whole width (about 4.6 units a letter) stays right of the crab's jump column
      expect((hint?.x ?? 0) - 15 * 4.6).toBeGreaterThan(60)
      // the scoreboard is where it was
      expect(texts(hinted(g, width), 'hd').length).toBe(texts(draw(g, width), 'hd').length)
    })
  }

  test('is drawn only when asked: the picture of a later game has no hint', () => {
    const g = game(FIELD.normal, 'play')
    expect(hintOf(sceneSvg(g, deskConfigFor(FIELD.normal), SIZE))).toHaveLength(0)
    expect(hintOf(hinted(g, FIELD.normal))).toHaveLength(1)
  })

  test('steps aside while a stage title is up in the same row', () => {
    const g = { ...game(FIELD.normal, 'play'), auto: true, stage: 1, stageAge: 3 }
    const svg = hinted(g, FIELD.normal)
    expect(hintOf(svg)).toHaveLength(0)
  })

  test('are for the first game of a session only', () => {
    expect(HINT_RUNS).toBe(1)
    expect(deskQuiet(0)).toBe(false)
    expect(deskQuiet(1)).toBe(true)
    expect(deskQuiet(40)).toBe(true)
  })
})

describe('the scoreboard', () => {
  for (const width of WIDTHS) {
    test(`at ${width} units wide it is all in the top right corner: the crab's side is clear`, () => {
      const svg = draw(game(width, 'play'), width)
      const hd = texts(svg, 'hd')
      // the score, the best, the clouds and the bugs fixed
      expect(hd.length).toBeGreaterThanOrEqual(1 + 4 + 2 + 2)
      for (const t of hd) {
        expect(t.x).toBeGreaterThan(HUD_FROM(width))
        expect(t.x).toBeLessThanOrEqual(width - 6)
        expect(t.y).toBeLessThan(SCENE.ground - 40)
      }
      // the cloud icon, the leftmost thing, is inside it too
      const icon = svg.match(/<g transform="translate\(([\d.]+) 3\)">/)
      expect(Number(icon?.[1])).toBeGreaterThanOrEqual(HUD_FROM(width) - 0.5)
      // and the checks are not left behind at the old corner
      for (const m of svg.matchAll(/<rect x="([\d.]+)" y="[3-7]" width="1" height="1" fill="#3B9C5F"/g)) expect(Number(m[1])).toBeGreaterThan(HUD_FROM(width))
      expect(HUD_FROM(width)).toBeGreaterThan(CRAB_CLEAR - 20)
    })
  }

  test('the order from the right is the best, the score, the bugs fixed, the clouds', () => {
    const svg = draw(game(FIELD.normal, 'play'), FIELD.normal)
    const best = texts(svg, 'hd hi')[0]
    const score = texts(svg, 'hd hs')
    expect(best?.text).toBe('HI 0377')
    expect(score.map(t => t.text).join('')).toBe('0123')
    const lastScoreX = Math.max(...score.map(t => t.x))
    expect(lastScoreX).toBeLessThan(best?.x ?? 0)
    // the other two counters are left of the score
    const others = texts(svg, 'hd').filter(t => !/hs|hi/.test(t.text) && t.x < Math.min(...score.map(s => s.x)))
    expect(others.map(t => t.text).join('')).toBe('0703')
  })
})

describe('the strip beside the scoreboard', () => {
  test('GAME OVER comes when the run ends, in the clear top row, and not before', () => {
    const play = draw(game(FIELD.normal, 'play'), FIELD.normal)
    expect(play).not.toContain('GAME OVER')
    const over = draw(game(FIELD.normal, 'over'), FIELD.normal)
    const [line] = texts(over, 'go')
    expect(line?.text).toBe('GAME OVER')
    expect(line?.y).toBe(9)
    // between the crab's column and the scoreboard
    const half = (9 * 6.2) / 2
    expect((line?.x ?? 0) - half).toBeGreaterThanOrEqual(CRAB_CLEAR)
    expect((line?.x ?? 0) + half).toBeLessThan(HUD_FROM(FIELD.normal))
  })

  test('a note that a run is over is never said as well: GAME OVER takes the place of what was up', () => {
    const over = draw(game(FIELD.normal, 'over', { note: NOTES.bug, noteAge: 5 }), FIELD.normal)
    expect(texts(over, 'nt')).toEqual([])
    expect(over).toContain('GAME OVER')
  })

  test('before a run starts the strip says what the game is', () => {
    const ready = draw(game(FIELD.normal, 'ready'), FIELD.normal)
    expect(texts(ready, 'nt').map(t => t.text)).toEqual(['grab clouds, dodge or fix bugs'])
    expect(draw(game(FIELD.normal, 'play'), FIELD.normal)).not.toContain('grab clouds')
  })

  test('every note fits the top row beside the scoreboard on a normal field, and drops to the middle on a narrow one', () => {
    for (const note of Object.values(NOTES)) {
      const normal = texts(draw(game(FIELD.normal, 'play', { note, noteAge: 2 }), FIELD.normal), 'nt')[0]
      expect(normal?.text).toBe(note)
      expect(normal?.y).toBe(9)
      const half = (note.length * 4.6) / 2
      expect((normal?.x ?? 0) - half).toBeGreaterThanOrEqual(CRAB_CLEAR)
      expect((normal?.x ?? 0) + half).toBeLessThan(HUD_FROM(FIELD.normal))
      // too narrow for the top row: it is where it always was
      const narrow = texts(draw(game(FIELD.min, 'play', { note, noteAge: 2 }), FIELD.min), 'nt')[0]
      expect(narrow?.y).toBe(20)
      expect(narrow?.x).toBe(FIELD.min / 2)
    }
  })
})
