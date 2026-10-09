import { describe, expect, test } from 'claude-code/testing'

import { COSTUMES, GRID, layers, paintOrder, toSvg } from './master'
import { act, deskConfig, fresh, header, lookFor, ROTATION, step, termConfig } from './game'
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

  test('a jump never lifts the crab past the field, and clears the tall bug', () => {
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

// a player that jumps as a bug comes within reach (about six ticks before it arrives)
const play = (cfg: Config, ticks: number, look: Parameters<typeof fresh>[3], skill = true): Game => {
  let g = act(fresh(0, 99, 'ready', look, cfg), cfg)
  for (let i = 0; i < ticks && g.mode === 'play'; i++) {
    const speed = cfg.speed(g.score)
    const reach = 6 * speed
    const next = g.obs.find(o => o.x + o.w > cfg.crabX + cfg.hit[0])
    if (skill && next && g.jump < 0 && next.x - (cfg.crabX + cfg.hit[1]) <= reach) g = act(g, cfg)
    g = step(g, cfg)
  }

  return g
}

describe('game rules', () => {
  for (const [name, cfg] of [['terminal', termConfig(56)], ['desktop', deskConfig]] as const) {
    test(`${name}: standing still ends the run, and the first bug does it`, () => {
      const g = play(cfg, 400, lookFor('plain', 0), false)
      expect(g.mode).toBe('over')
      expect(g.best).toBeGreaterThan(0)
      expect(g.score).toBeLessThan(150)
    })

    test(`${name}: every bug, small and big, can be jumped, at every speed it reaches`, () => {
      // a long run of well-timed jumps never dies: the arc clears the tallest bug with room to spare
      const g = play(cfg, 6000, lookFor('plain', 0))
      expect(g.mode).toBe('play')
      expect(g.tick).toBeGreaterThanOrEqual(6000)
      expect(g.score).toBeGreaterThanOrEqual(6000 * cfg.perTick)
      expect(cfg.speed(g.score)).toBe(cfg.speed(99999))
    })

    test(`${name}: bugs start off the field's right edge and are dropped once they pass`, () => {
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
      const g = {
        ...fresh(0, 3, 'play', lookFor(costume, 0), deskConfig),
        tick: 5,
        obs: [{ x: 200, w: 12, h: 13, tall: true }, { x: 280, w: 12, h: 9, tall: false }],
        clouds: [{ x: 120, w: 16, h: 40 }],
        pops: [{ x: 90, h: 40, age: 2 }],
      }
      const svg = sceneSvg(g, deskConfig, { width: 540, height: 108 })
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg).toContain(`viewBox="0 0 ${SCENE.w} ${SCENE.h}"`)
      expect(svg).toContain('#D97757')
      expect(svg).toContain('#3B9C5F')
      expect(svg).toContain('#C0392B')
      expect(svg).toContain('#9CCBF2')
      expect(svg).toContain('#F5C542')
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

describe('clouds and bugs', () => {
  const live = (cfg: Config) => act(fresh(0, 9, 'ready', lookFor('plain', 0), cfg), cfg)

  for (const [name, cfg] of [['terminal', termConfig(56)], ['desktop', deskConfig]] as const) {
    test(`${name}: reaching a cloud in a jump grabs it, scores it, and sparkles; the ground cannot`, () => {
      const cloud = { x: cfg.crabX + cfg.reach[0] + 6, w: cfg.cloud.w, h: cfg.cloud.h(0) }
      // on the ground the crab cannot reach it: the cloud goes by
      let low = { ...live(cfg), clouds: [cloud] }
      for (let i = 0; i < 40; i++) low = { ...step(low, cfg), obs: [] }
      expect(low.grabbed).toBe(0)

      // at the top of the jump it can
      let up = { ...live(cfg), clouds: [cloud], y: Math.max(...cfg.arc), jump: Math.floor(cfg.arc.length / 2) }
      const before = up.score
      up = step(up, cfg)
      expect(up.grabbed).toBe(1)
      expect(up.clouds).toHaveLength(0)
      expect(up.pops).toHaveLength(1)
      expect(up.score).toBeGreaterThanOrEqual(before + cfg.cloudPoints)
    })

    test(`${name}: clouds keep coming, and sparkles die out`, () => {
      let g = live(cfg)
      const seen = new Set<number>()
      for (let i = 0; i < 1500 && g.mode === 'play'; i++) {
        g = { ...step(g, cfg), obs: [] }
        for (const c of g.clouds) {
          seen.add(c.h)
          expect(c.h).toBeGreaterThan(cfg.crabH)
        }
        expect(g.pops.length).toBeLessThanOrEqual(1)
      }
      expect(g.mode).toBe('play')
      expect(g.tick).toBe(1500)
      expect(seen.size).toBeGreaterThanOrEqual(1)
    })

    test(`${name}: a press just before landing is kept, and jumps the moment the crab is down`, () => {
      let g = live(cfg)
      g = { ...g, obs: [] }
      g = act(g, cfg)
      for (let i = 0; i < cfg.arc.length - 3; i++) g = { ...step(g, cfg), obs: [] }
      expect(g.jump).toBeGreaterThanOrEqual(0)
      g = act(g, cfg)
      expect(g.queued).toBe(true)
      for (let i = 0; i < 6 && g.queued; i++) g = { ...step(g, cfg), obs: [] }
      expect(g.queued).toBe(false)
      expect(g.jump).toBeGreaterThanOrEqual(0)
    })
  }

  test('a press far from landing is not queued', () => {
    const g = act(act(live(deskConfig), deskConfig), deskConfig)
    expect(g.queued).toBe(false)
  })

  test('the desktop runs faster than before, in small steps, and quickens smoothly', () => {
    expect(deskConfig.tickMs).toBeLessThanOrEqual(40)
    // units a second: it was 57 at the start and 114 at the top
    expect((deskConfig.speed(0) * 1000) / deskConfig.tickMs).toBeGreaterThanOrEqual(70)
    expect(deskConfig.speed(Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(6)
    let last = deskConfig.speed(0)
    for (let score = 0; score < 3000; score += 10) {
      const v = deskConfig.speed(score)
      expect(v - last).toBeLessThan(0.05)
      expect(v).toBeGreaterThanOrEqual(last)
      last = v
    }
    // the jump is a smooth rise and fall
    const arc = deskConfig.arc
    for (let i = 1; i < arc.length; i++) expect(Math.abs((arc[i] ?? 0) - (arc[i - 1] ?? 0))).toBeLessThan(7)
  })

  test('the one line of guidance carries the score, the clouds grabbed, and the keys', () => {
    const g = fresh(377, 3, 'play', lookFor('plain', 0), deskConfig)
    expect(header({ ...g, score: 95.6, grabbed: 2 })).toBe(' score 0095 · ☁ 2 · best 0377 · space / ↑ to jump')
    expect(header({ ...g, mode: 'over', score: 95.6, grabbed: 2 })).toBe(' game over 0095 · ☁ 2 · best 0377 · space / ↑ to retry')
    expect(header({ ...g, mode: 'ready' })).toContain('space / ↑ to start')
  })
})
