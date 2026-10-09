import { describe, expect, test } from 'claude-code/testing'

import { COSTUMES, GRID, layers, paintOrder, toSvg } from './master'
import { act, ahead, deskConfig, deskConfigFor, fresh, header, lookFor, NOTE_TICKS, POP_LIFE, ROTATION, step, termConfig } from './game'
import type { Config, Game, Kind } from './game'
import { pilot } from './pilot'
import { ARC, HIT, MINI_W, miniFrame, miniHeight, toCells, toRuns } from './mini'
import { motionSvg, sceneSvg, SCENE, topOf } from './scene'

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

// a player that jumps as a bug comes within reach (about six ticks before it arrives); on the
// desktop, with its moths and pits, the pilot that centres each jump and ducks under what flies
const play = (cfg: Config, ticks: number, look: Parameters<typeof fresh>[3], skill = true): Game => {
  let g = act(fresh(0, 99, 'ready', look, cfg), cfg)
  for (let i = 0; i < ticks && g.mode === 'play'; i++) {
    const speed = cfg.speed(g.score)
    const reach = 6 * speed
    const next = g.obs.find(o => o.x + o.w > cfg.crabX + cfg.hit[0])
    if (skill && cfg.duckTicks > 0) g = pilot(g, cfg)
    else if (skill && next && g.jump < 0 && next.x - (cfg.crabX + cfg.hit[1]) <= reach) g = act(g, cfg)
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

    test(`${name}: every obstacle can be got past, at every speed it reaches`, () => {
      // a long run of well-timed moves never dies: the arc clears the tallest bug with room to spare
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

const KINDS: Kind[] = ['bug', 'beetle', 'moth', 'twin', 'pit']
const SIZE = { width: 840, height: 144 }

/** A run `g` as it goes with no key pressed: the state `n` steps on. */
const idle = (g: Game, cfg: Config, n: number): Game => ahead(g, cfg, n).at(-1) ?? g

describe('desktop scene', () => {
  const crowd = (costume: (typeof ROTATION)[number]): Game => ({
    ...fresh(0, 3, 'play', lookFor(costume, 0), deskConfig),
    tick: 5,
    obs: [
      { id: 1, x: 200, w: 12, h: 13, base: 0, tall: true, kind: 'beetle' },
      { id: 2, x: 280, w: 12, h: 9, base: 0, tall: false, kind: 'bug' },
      { id: 3, x: 330, w: 14, h: 9, base: 11, tall: false, kind: 'moth' },
      { id: 4, x: 360, w: 27, h: 9, base: 0, tall: false, kind: 'twin' },
      { id: 5, x: 100, w: 30, h: 0, base: 0, tall: false, kind: 'pit' },
    ],
    clouds: [{ id: 6, x: 120, w: 16, h: 40 }, { id: 7, x: 160, w: 10, h: 28, t: 10, shield: true }],
    pops: [
      { id: 8, x: 90, h: 40, age: 2, kind: 'spark' },
      { id: 9, x: 70, h: 20, age: 2, kind: 'poof' },
      { id: 10, x: 60, h: 20, age: 4, kind: 'text', text: '+10' },
    ],
    shield: true,
    note: 'moth! duck under it with ↓ or J',
    noteAge: 3,
  })

  test('every costume draws a standalone svg on the ground, in the scene box, with everything that can come', () => {
    for (const costume of ROTATION) {
      const svg = sceneSvg(crowd(costume), deskConfig, SIZE)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg).toContain(`viewBox="0 0 ${deskConfig.width} ${SCENE.h}"`)
      for (const color of ['#D97757', '#3B9C5F', '#C0392B', '#9CCBF2', '#F5C542', '#7F77DD', '#4CB878']) expect(svg).toContain(color)
      expect(svg).toContain('moth! duck under it')
      expect(svg).toContain('+10')
      expect(svg.length).toBeLessThan(40000)
    }
  })

  test('the markup is balanced: every group and animation closes', () => {
    const plan = ahead({ ...crowd('chef'), obs: [], clouds: [] }, deskConfig, 192)
    for (const svg of [sceneSvg(crowd('astronaut'), deskConfig, SIZE), motionSvg({ states: plan, phase: 0.3 }, deskConfig, SIZE)]) {
      expect(svg.match(/<g[ >]/g)?.length).toBe(svg.match(/<\/g>/g)?.length)
      expect(svg.match(/<text[ >]/g)?.length ?? 0).toBe(svg.match(/<\/text>/g)?.length ?? 0)
      expect((svg.match(/</g) ?? []).length).toBe((svg.match(/>/g) ?? []).length)
      expect(svg).not.toMatch(/NaN|undefined|Infinity/)
    }
  })

  test('the crab leaves the ground while it jumps and never leaves the scene', () => {
    const base = fresh(0, 3, 'play', lookFor('chef', 0), deskConfig)
    const ty = (y: number) => Number(/translate\(36 (-?[\d.]+)\)/.exec(sceneSvg({ ...base, y }, deskConfig, SIZE))?.[1])
    expect(ty(0)).toBe(SCENE.ground - SCENE.feet)
    expect(ty(20)).toBe(SCENE.ground - SCENE.feet - 20)
    // the highest hat at the top of the jump is still inside the scene
    const top = Math.max(...deskConfig.arc)
    for (const c of ROTATION) expect(SCENE.ground - SCENE.feet - top + topOf(c)).toBeGreaterThanOrEqual(0)
  })

  test('a lost run is drawn belly up and grey; a pit takes the crab down instead', () => {
    const g = fresh(0, 3, 'over', lookFor('plain', 0), deskConfig)
    expect(sceneSvg(g, deskConfig, SIZE)).toContain('values="0 15 18;180 15 18"')
    expect(sceneSvg({ ...g, mode: 'play' }, deskConfig, SIZE)).not.toContain('180 15 18')
    expect(sceneSvg(g, deskConfig, SIZE)).toContain('opacity=".6"')
    const pit = sceneSvg({ ...g, cause: 'pit' }, deskConfig, SIZE)
    expect(pit).toContain(`${SCENE.ground + 34}`)
    expect(pit).not.toContain('opacity=".6"')
  })

  test('a still has nothing to run but the things that loop; a plan animates what moves', () => {
    const g = fresh(0, 3, 'play', lookFor('plain', 0), deskConfig)
    const still = sceneSvg(g, deskConfig, SIZE)
    expect(still).not.toContain('fill="freeze"')
    expect(still).not.toContain('translate(0 0 0)')
    const plan = motionSvg({ states: ahead(act(g, deskConfig), deskConfig, 48), phase: 0.5 }, deskConfig, SIZE)
    // each animation starts half a step in: the picture is right at its first moment
    expect(plan).toContain(`begin="-${(0.5 * deskConfig.tickMs) / 1000}s"`)
    expect(plan).toContain(`dur="${(48 * deskConfig.tickMs) / 1000}s"`)
    expect(plan).toContain('attributeName="transform" type="translate"')
  })

  test('the scoreboard is drawn into the picture and counts inside it', () => {
    let g = act(fresh(377, 5, 'ready', lookFor('plain', 0), deskConfig), deskConfig)
    for (let i = 0; i < 30; i++) g = step(pilot(g, deskConfig), deskConfig)
    const still = sceneSvg(g, deskConfig, SIZE)
    expect(still).toContain('HI 0377')
    const plan = motionSvg({ states: ahead(g, deskConfig, 96), phase: 0 }, deskConfig, SIZE)
    // the places of the score each stack their digits and show one at a time
    expect(plan.match(/class="hd hs"/g)?.length).toBeGreaterThan(8)
    expect(plan).toMatch(/class="hd hs"[^>]*visibility="hidden"/)
    expect(plan).toContain('attributeName="visibility"')
    // a still shows exactly one digit a place
    expect(still.match(/class="hd hs"/g)?.length).toBe(4)
  })

  test('a plan is exact: the run it shows is the run the rules play', () => {
    let g = act(fresh(0, 41, 'ready', lookFor('plain', 0), deskConfig), deskConfig)
    for (let i = 0; i < 90; i++) g = step(pilot(g, deskConfig), deskConfig)
    const states = ahead(g, deskConfig, 60)
    let live = g
    for (let i = 0; i < 60 && live.mode === 'play'; i++) {
      live = step(live, deskConfig)
      expect(states[i + 1]?.y).toBe(live.y)
      expect(states[i + 1]?.obs.map(o => o.x)).toEqual(live.obs.map(o => o.x))
    }
    // and a bug's path in the markup is the one the rules gave it
    const svg = motionSvg({ states, phase: 0 }, deskConfig, SIZE)
    const first = states[0]?.obs[0]
    if (first) expect(svg).toContain(`translate(${Math.round(first.x * 10) / 10} `)
  })

  test('a plan of the longest stretch at top speed stays well inside what the surface takes', () => {
    let g = act(fresh(0, 9, 'ready', lookFor('astronaut', 0), deskConfig), deskConfig)
    g = { ...g, score: 3000 }
    for (let i = 0; i < 200; i++) g = step(pilot(g, deskConfig), deskConfig)
    const svg = motionSvg({ states: ahead(g, deskConfig, 192), phase: 0.7 }, deskConfig, SIZE)
    expect(svg.length).toBeLessThan(100000)
  })

  test('every animation is well formed: lists agree with their times, begins are not after the start', () => {
    let g = act(fresh(0, 5, 'ready', lookFor('racer', 0), deskConfig), deskConfig)
    for (let i = 0; i < 400; i++) g = step(pilot(g, deskConfig), deskConfig)
    const svg = motionSvg({ states: ahead(g, deskConfig, 192), phase: 0.25 }, deskConfig, SIZE)
    for (const tag of svg.match(/<animate(Transform)?[^>]*>/g) ?? []) {
      const values = /values="([^"]*)"/.exec(tag)?.[1]?.split(';')
      const times = /keyTimes="([^"]*)"/.exec(tag)?.[1]?.split(';')
      if (values && times) expect(times.length).toBe(values.length)
      if (times) expect(Number(times[0])).toBe(0)
      for (const b of tag.match(/begin="(-?[\d.]+)s"/g) ?? []) expect(Number(/(-?[\d.]+)/.exec(b)?.[1])).toBeLessThanOrEqual(2)
      expect(tag).toMatch(/dur="[\d.]+s"|<set/)
    }
  })

  test('the field fills the band: a wider one has more to see but the same way across', () => {
    for (const width of [260, 420, 520]) {
      const cfg = deskConfigFor(width)
      expect(cfg.width).toBe(width)
      const crossing = (cfg.width - cfg.crabX) / cfg.speed(0) / 25
      expect(crossing).toBeGreaterThan(2)
    }
  })
})

describe('what comes at the crab', () => {
  const live = (cfg: Config = deskConfig): Game => act(fresh(0, 9, 'ready', lookFor('plain', 0), cfg), cfg)
  const bug = (over: Partial<Game['obs'][number]> = {}): Game['obs'][number] => ({ id: 90, x: 50, w: 12, h: 9, base: 0, tall: false, kind: 'bug', ...over })

  test('a bug at the crab ends the run; standing under a moth too, but a crab that ducks goes under it', () => {
    const cfg = deskConfig
    const hit = step({ ...live(), obs: [bug({ x: cfg.crabX + 14 })] }, cfg)
    expect(hit.mode).toBe('over')
    expect(hit.cause).toBe('hit')

    const moth = bug({ kind: 'moth', w: 14, h: 9, base: 11, x: cfg.crabX + 14 })
    expect(step({ ...live(), obs: [moth] }, cfg).mode).toBe('over')
    const ducked = act(live(), cfg, 'duck')
    expect(ducked.duck).toBe(cfg.duckTicks)
    expect(step({ ...ducked, obs: [moth] }, cfg).mode).toBe('play')
  })

  test('a duck is short, a jump cancels it, and a press in the air is a dive that lands sooner', () => {
    const cfg = deskConfig
    let g = act(live(), cfg, 'duck')
    for (let i = 0; i < cfg.duckTicks; i++) g = { ...step(g, cfg), obs: [] }
    expect(g.duck).toBe(0)
    g = act(act(live(), cfg, 'duck'), cfg)
    expect(g.duck).toBe(0)
    expect(g.jump).toBe(0)

    const ticksToLand = (dive: boolean) => {
      let j = act(live(), cfg)
      for (let i = 0; i < 4; i++) j = { ...step(j, cfg), obs: [] }
      if (dive) j = act(j, cfg, 'duck')
      let n = 0
      while (j.jump >= 0 && n < 40) {
        j = { ...step(j, cfg), obs: [] }
        n++
      }

      return n
    }
    expect(ticksToLand(true)).toBeLessThan(ticksToLand(false))
    // with no duck on the terminal, the duck key is just a jump
    expect(act(live(termConfig(56)), termConfig(56), 'duck').jump).toBe(0)
  })

  test('landing on a bug fixes it: it goes, the crab bounces, the points come, and a chain pays more', () => {
    const cfg = deskConfig
    // falling, feet a little above the top of the bug and over it
    const falling = { ...live(), y: 14, jump: 15, obs: [bug({ x: cfg.crabX + 12 })] }
    const a = step(falling, cfg)
    expect(a.mode).toBe('play')
    expect(a.obs).toHaveLength(0)
    expect(a.fixed).toBe(1)
    expect(a.score).toBeGreaterThanOrEqual(cfg.stomp)
    expect(a.y).toBeGreaterThan(9)
    expect(a.jump).toBeGreaterThan(0)
    expect(a.pops.map(p => p.kind).sort()).toEqual(['poof', 'text'])
    expect(a.pops.find(p => p.kind === 'text')?.text).toBe('+10')

    // a second one before touching the ground is worth double
    const b = step({ ...a, y: 14, jump: 15, obs: [bug({ id: 91, x: cfg.crabX + 12 })] }, cfg)
    expect(b.fixed).toBe(2)
    expect(b.pops.find(p => p.kind === 'text' && p.age === 0)?.text).toBe('x2 +20')
    // the crab being on its way up is no stomp
    expect(step({ ...live(), y: 0, jump: 0, obs: [bug({ x: cfg.crabX + 12 })] }, cfg).mode).toBe('over')
  })

  test('a pit takes a crab that walks into it; a crab in the air crosses it', () => {
    const cfg = deskConfig
    const pit = { id: 92, x: cfg.crabX + 4, w: 30, h: 0, base: 0, tall: false, kind: 'pit' as const }
    const fell = step({ ...live(), obs: [pit] }, cfg)
    expect(fell.mode).toBe('over')
    expect(fell.cause).toBe('pit')
    expect(step({ ...live(), y: 20, jump: 6, obs: [pit] }, cfg).mode).toBe('play')
  })

  test('the shield takes one hit, blasts the bug, and the crab is safe for a moment after', () => {
    const cfg = deskConfig
    const orb = { id: 93, x: cfg.crabX + 6, w: 10, h: 24, t: 10, shield: true }
    const got = step({ ...live(), y: 12, jump: 4, clouds: [orb] }, cfg)
    expect(got.shield).toBe(true)
    expect(got.grabbed).toBe(0)
    expect(got.pops.some(p => p.text === 'shield!')).toBe(true)

    const hit = step({ ...got, y: 0, jump: -1, obs: [bug({ x: cfg.crabX + 14 })] }, cfg)
    expect(hit.mode).toBe('play')
    expect(hit.shield).toBe(false)
    expect(hit.inv).toBeGreaterThan(0)
    expect(hit.obs).toHaveLength(0)
    expect(hit.fixed).toBe(1)
    // while the grace lasts a second bug cannot hurt; afterwards it can
    expect(step({ ...hit, obs: [bug({ id: 94, x: cfg.crabX + 14 })] }, cfg).mode).toBe('play')
    expect(step({ ...hit, inv: 0, obs: [bug({ id: 95, x: cfg.crabX + 14 })] }, cfg).mode).toBe('over')
  })

  test('each kind of obstacle waits for its score, and only then comes', () => {
    const cfg = deskConfig
    const first: Partial<Record<Kind, number>> = {}
    for (const seed of [3, 11, 77, 123, 321]) {
      let g = act(fresh(0, seed, 'ready', lookFor('plain', 0), cfg), cfg)
      for (let i = 0; i < 6000 && g.mode === 'play'; i++) {
        g = step(pilot(g, cfg), cfg)
        for (const o of g.obs) if (o.x > cfg.width - 8) first[o.kind] = Math.min(first[o.kind] ?? Infinity, g.score)
      }
    }
    for (const kind of KINDS) {
      expect(first[kind]).toBeDefined()
      expect(first[kind] ?? 0).toBeGreaterThanOrEqual(cfg.unlock[kind] - 1)
    }
    expect(Object.keys(first).sort()).toEqual([...KINDS].sort())
  })

  test('the first of each kind is announced, once, and the words fade', () => {
    const cfg = deskConfig
    let g = act(fresh(0, 7, 'ready', lookFor('plain', 0), cfg), cfg)
    const said: string[] = []
    let last = ''
    for (let i = 0; i < 6000 && g.mode === 'play'; i++) {
      g = step(pilot(g, cfg), cfg)
      if (g.note && g.note !== last) said.push(g.note)
      last = g.note
      expect(g.noteAge).toBeLessThanOrEqual(NOTE_TICKS)
    }
    expect(said.filter(n => /moth/.test(n))).toHaveLength(1)
    expect(said.filter(n => /segfault/.test(n))).toHaveLength(1)
    expect(said.filter(n => /shield/.test(n))).toHaveLength(1)
    // the words are gone a few seconds after
    expect(idle({ ...g, note: 'x', noteAge: 0 }, cfg, NOTE_TICKS + 2).note).toBe('')
    // the terminal says nothing
    const t = termConfig(56)
    let tg = act(fresh(0, 7, 'ready', lookFor('plain', 0), t), t)
    for (let i = 0; i < 300 && tg.mode === 'play'; i++) tg = step(tg, t)
    expect(tg.note).toBe('')
  })

  test('a pilot that lands on bugs instead of clearing them survives, and earns far more', () => {
    const cfg = deskConfig
    const run = (stomp: boolean) => {
      let g = act(fresh(0, 3, 'ready', lookFor('plain', 0), cfg), cfg)
      for (let i = 0; i < 3000 && g.mode === 'play'; i++) g = step(pilot(g, cfg, { stomp }), cfg)

      return g
    }
    const clear = run(false)
    const stomper = run(true)
    expect(clear.mode).toBe('play')
    expect(stomper.mode).toBe('play')
    expect(stomper.fixed).toBeGreaterThan(40)
    expect(stomper.score).toBeGreaterThan(clear.score * 1.3)
  })

  test('the bursts live their length and go', () => {
    const cfg = deskConfig
    let g: Game = { ...live(), pops: [{ id: 5, x: 50, h: 20, age: 0, kind: 'text', text: '+10' }] }
    for (let i = 0; i < POP_LIFE.text - 1; i++) g = { ...step(g, cfg), obs: [] }
    expect(g.pops).toHaveLength(1)
    g = { ...step(g, cfg), obs: [] }
    expect(g.pops).toHaveLength(0)
  })
})

describe('clouds and bugs', () => {
  const live = (cfg: Config) => act(fresh(0, 9, 'ready', lookFor('plain', 0), cfg), cfg)

  for (const [name, cfg] of [['terminal', termConfig(56)], ['desktop', deskConfig]] as const) {
    test(`${name}: reaching a cloud in a jump grabs it, scores it, and sparkles; the ground cannot`, () => {
      const cloud = { id: 77, x: cfg.crabX + cfg.reach[0] + 6, w: cfg.cloud.w, h: cfg.cloud.h(0) }
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
    // units a second: it was 75 at the start and 140 at the top (in a field a fifth narrower)
    expect((deskConfig.speed(0) * 1000) / deskConfig.tickMs).toBeGreaterThanOrEqual(90)
    expect(deskConfig.speed(Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(7.5)
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
    expect(header({ ...g, score: 95.6, grabbed: 2, fixed: 5 })).toBe(' score 0095 · ☁ 2 · ✓ 5 · best 0377 · space / ↑ to jump')
    expect(header({ ...g, mode: 'over', score: 95.6, grabbed: 2 })).toBe(' game over 0095 · ☁ 2 · best 0377 · space / ↑ to retry')
    expect(header({ ...g, mode: 'ready' })).toContain('space / ↑ to start')
  })
})
