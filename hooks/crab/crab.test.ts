import { describe, expect, test } from 'claude-code/testing'

import { COSTUMES, GRID, layers, paintOrder, toSvg } from './master'
import { ARC, HIT, MINI_W, miniFrame, miniHeight, toCells, toRuns } from './mini'

describe('master sprites', () => {
  test('seven costumes, each with a body and both leg pairs, all inside the grid', () => {
    expect(COSTUMES.map(c => c.id)).toEqual(['plain', 'astronaut', 'detective', 'engineer', 'chef', 'racer', 'pirate'])
    for (const c of COSTUMES) {
      const l = layers(c.id)
      expect(l.bd?.length).toBeGreaterThan(0)
      expect(l.la?.length).toBe(2)
      expect(l.lb?.length).toBe(2)
      expect(paintOrder(l).slice(-2)).toEqual(['la', 'lb'])
      for (const rects of Object.values(l)) {
        for (const [x, y, w, h] of rects) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(x + w).toBeLessThanOrEqual(GRID.w)
          expect(y + h).toBeLessThanOrEqual(GRID.h)
        }
      }
    }
  })

  test('each costume adds its own prop group on top of the plain crab', () => {
    const props = (id: Parameters<typeof layers>[0]) => Object.keys(layers(id)).filter(k => !['bd', 'la', 'lb'].includes(k))
    expect(props('plain')).toEqual([])
    expect(props('astronaut')).toEqual(expect.arrayContaining(['ant', 'star']))
    expect(props('detective')).toEqual(expect.arrayContaining(['it', 'gl']))
    expect(props('chef')).toEqual(expect.arrayContaining(['pan', 'egg']))
    expect(props('racer')).toEqual(['flag'])
  })

  test('the svg is standalone, and animated only when asked', () => {
    const live = toSvg('racer')
    expect(live).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(live).toContain('c-light run')
    expect(toSvg('racer', { animated: false })).not.toContain(' run"')
  })
})

describe('game-size sprites', () => {
  test('every pose is nine wide, in every costume, and the hit columns sit inside the body', () => {
    for (const c of COSTUMES) {
      for (const [step, air, dead] of [[0, false, false], [1, false, false], [0, true, false], [0, false, true]] as const) {
        const f = miniFrame(c.id, step, air, dead)
        expect(f.length).toBe(miniHeight(c.id))
        for (const row of f) expect(row.length).toBe(MINI_W)
      }
    }
    expect(HIT.from).toBeGreaterThanOrEqual(1)
    expect(HIT.to).toBeLessThanOrEqual(MINI_W - 2)
  })

  test('the two walk frames differ in the legs; a dead crab is grey', () => {
    const a = miniFrame('plain', 0)
    const b = miniFrame('plain', 1)
    expect(a.at(-1)).not.toEqual(b.at(-1))
    expect(a.slice(0, -1)).toEqual(b.slice(0, -1))
    for (const row of miniFrame('chef', 0, false, true)) {
      for (const px of row) if (px) expect(px.slice(1, 3)).toBe(px.slice(3, 5))
    }
  })

  test('a jump never lifts the crab past the field, and clears the tall rock', () => {
    const tallest = Math.max(...COSTUMES.map(c => miniHeight(c.id)))
    expect(tallest + Math.max(...ARC)).toBeLessThanOrEqual(10)
    expect(Math.max(...ARC)).toBeGreaterThanOrEqual(3)
  })

  test('two pixel rows draw as one cell row with half blocks', () => {
    const rows = toCells([
      ['#111111', null, '#222222', '#333333'],
      [null, '#444444', '#555555', '#333333'],
      ['#666666', null, null, null],
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual([
      { ch: '▀', fg: '#111111' },
      { ch: '▄', fg: '#444444' },
      { ch: '▀', fg: '#222222', bg: '#555555' },
      { ch: '█', fg: '#333333' },
    ])
    expect(rows[1]?.[0]).toEqual({ ch: '▀', fg: '#666666' })
    expect(toRuns([{ ch: ' ' }, { ch: ' ' }, { ch: '▀', fg: '#111111' }])).toEqual([
      { text: '  ', fg: undefined, bg: undefined },
      { text: '▀', fg: '#111111', bg: undefined },
    ])
  })
})
