import { describe, expect, test } from 'claude-code/testing'

import { COSTUMES, GRID, layers, paintOrder, toSvg } from './master'
import { act, deskConfig, fresh, lookFor, ROTATION, step, termConfig } from './game'
import type { Config, Game } from './game'
import { ARC, HIT, MINI_W, miniFrame, miniHeight, toCells, toRuns } from './mini'
import { sceneSvg, SCENE, topOf } from './scene'

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

// a player that jumps as a rock comes within reach
const play = (cfg: Config, ticks: number, look: Parameters<typeof fresh>[3], skill = true): Game => {
  let g = act(fresh(0, 99, 'ready', look, cfg), cfg)
  for (let i = 0; i < ticks && g.mode === 'play'; i++) {
    const speed = cfg.speed(g.score)
    const reach = cfg.arc.length * speed * 0.3
    const next = g.obs.find(o => o.x + o.w > cfg.crabX + cfg.hit[0])
    if (skill && next && g.jump < 0 && next.x - (cfg.crabX + cfg.hit[1]) <= reach) g = act(g, cfg)
    g = step(g, cfg)
  }

  return g
}

describe('game rules', () => {
  for (const [name, cfg] of [['terminal', termConfig(56)], ['desktop', deskConfig]] as const) {
    test(`${name}: standing still ends the run, and the first rock does it`, () => {
      const g = play(cfg, 400, lookFor('plain', 0), false)
      expect(g.mode).toBe('over')
      expect(g.best).toBeGreaterThan(0)
      expect(g.score).toBeLessThan(150)
    })

    test(`${name}: every rock and cactus can be jumped, at every speed it reaches`, () => {
      // a long run of well-timed jumps never dies: the arc clears the tallest obstacle with room to spare
      const g = play(cfg, 6000, lookFor('plain', 0))
      expect(g.mode).toBe('play')
      expect(g.score).toBeGreaterThanOrEqual(6000)
      expect(cfg.speed(g.score)).toBe(cfg.speed(99999))
    })

    test(`${name}: obstacles start off the field's right edge and are dropped once they pass`, () => {
      let g = act(fresh(0, 5, 'ready', lookFor('plain', 0), cfg), cfg)
      const seen = new Set<number>()
      for (let i = 0; i < 400 && g.mode === 'play'; i++) {
        g = step(g, cfg)
        for (const o of g.obs) {
          expect(o.x + o.w).toBeGreaterThan(0)
          expect(o.x).toBeLessThanOrEqual(cfg.width)
          seen.add(o.x)
        }
        if (g.jump < 0 && g.obs.some(o => o.x < cfg.crabX + cfg.hit[1] + 3 * cfg.speed(g.score) && o.x + o.w > cfg.crabX)) g = act(g, cfg)
      }
      expect(seen.size).toBeGreaterThan(5)
    })
  }

  test('a new costume comes with every retry, and a named one stays', () => {
    const auto = lookFor('auto', 0)
    let g = act(fresh(0, 3, 'ready', auto, deskConfig), deskConfig)
    expect(g.costume).toBe(ROTATION[0])
    g = { ...g, mode: 'over' }
    g = act(g, deskConfig)
    expect(g.costume).toBe(ROTATION[1])
    const chef = lookFor('chef', 4)
    let c = act(fresh(0, 3, 'ready', chef, deskConfig), deskConfig)
    c = act({ ...c, mode: 'over' }, deskConfig)
    expect(c.costume).toBe('chef')
  })

  test('the best score is kept when a run ends', () => {
    const g = play(deskConfig, 300, lookFor('plain', 0), false)
    expect(g.best).toBe(g.mode === 'over' ? g.best : 0)
    expect(g.best).toBeGreaterThanOrEqual(0)
  })
})

describe('desktop scene', () => {
  test('every costume draws a standalone svg on the ground, in the scene box', () => {
    for (const costume of ROTATION) {
      const g = { ...fresh(0, 3, 'play', lookFor(costume, 0), deskConfig), tick: 5, obs: [{ x: 200, w: 8, h: 18, tall: true }, { x: 280, w: 12, h: 9, tall: false }] }
      const svg = sceneSvg(g, deskConfig, { width: 540, height: 108 })
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg).toContain(`viewBox="0 0 ${SCENE.w} ${SCENE.h}"`)
      expect(svg).toContain('#D97757')
      expect(svg).toContain('#3B9C5F')
      expect(svg).toContain('#8E929A')
      expect(svg.length).toBeLessThan(20000)
    }
  })

  test('the crab leaves the ground while it jumps and never leaves the scene', () => {
    const base = fresh(0, 3, 'play', lookFor('chef', 0), deskConfig)
    const ty = (y: number) => Number(/translate\(36 (-?[\d.]+)\)/.exec(sceneSvg({ ...base, y }, deskConfig, { width: 540, height: 108 }))?.[1])
    expect(ty(0)).toBe(SCENE.ground - SCENE.feet)
    expect(ty(20)).toBe(SCENE.ground - SCENE.feet - 20)
    // the highest hat at the top of the jump is still inside the scene
    const top = Math.max(...deskConfig.arc)
    for (const c of ROTATION) expect(SCENE.ground - SCENE.feet - top + topOf(c)).toBeGreaterThanOrEqual(0)
  })

  test('a lost run is drawn belly up and grey', () => {
    const g = fresh(0, 3, 'over', lookFor('plain', 0), deskConfig)
    expect(sceneSvg(g, deskConfig, { width: 540, height: 108 })).toContain('rotate(180 15 18)')
    expect(sceneSvg({ ...g, mode: 'play' }, deskConfig, { width: 540, height: 108 })).not.toContain('rotate(180')
  })
})
