import { describe, expect, test } from 'claude-code/testing'

import { AMBIENT, GROUND } from './ambient'
import { act, deskConfig, fresh, header, lookFor, place, step, termConfig, termHeader } from './game'
import type { Config, Game, Kind } from './game'
import { GAUNTLETS, gauntletChance } from './gauntlet'
import type { Piece } from './gauntlet'
import { pilot, slack } from './pilot'
import { LAP, STAGE_BONUS, STAGE_TICKS, STAGES, stageAt, stageOf } from './stages'

const playing = (look: string, cfg: Config = deskConfig): Game => act(fresh(0, 5, 'ready', lookFor(look), cfg), cfg)

describe('the journey: costumes change as the score climbs', () => {
  test('the stages are in order, start at zero, and fit inside a lap', () => {
    expect(STAGES[0]?.at).toBe(0)
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i]?.at ?? 0).toBeGreaterThan(STAGES[i - 1]?.at ?? 0)
    expect(STAGES.at(-1)?.at ?? Infinity).toBeLessThan(LAP)
    // every costume has a stage, once
    expect(new Set(STAGES.map(s => s.costume)).size).toBe(STAGES.length)
  })

  test('every stage lasts long enough to be seen: at least 20 seconds on the desktop, 20 in the terminal', () => {
    const pace = (cfg: Config) => (cfg.perTick * 1000) / cfg.tickMs // points a second, before any clouds
    const ends = [...STAGES.map(s => s.at), LAP]
    for (let i = 1; i < ends.length; i++) {
      const span = (ends[i] ?? 0) - (ends[i - 1] ?? 0)
      expect(span / pace(deskConfig)).toBeGreaterThanOrEqual(20)
      expect(span / pace(termConfig(60))).toBeGreaterThanOrEqual(20)
    }
    // and the title is gone well before the next stage comes
    expect((STAGE_TICKS * deskConfig.tickMs) / 1000).toBeLessThan(5)
  })

  test('the score maps to a stage, and the laps come round again', () => {
    expect(stageAt(0)).toBe(0)
    const second = STAGES[1]?.at ?? 0
    expect(stageAt(second - 0.1)).toBe(0)
    expect(stageAt(second)).toBe(1)
    expect(stageAt(LAP - 1)).toBe(STAGES.length - 1)
    expect(stageAt(LAP)).toBe(STAGES.length)
    expect(stageOf(STAGES.length).costume).toBe(STAGES[0]?.costume)
    expect(stageAt(LAP + second)).toBe(STAGES.length + 1)
    // it never goes back as the score rises
    let last = 0
    for (let s = 0; s < LAP * 3; s += 7) {
      expect(stageAt(s)).toBeGreaterThanOrEqual(last)
      last = stageAt(s)
    }
  })

  for (const [name, cfg] of [['desktop', deskConfig], ['terminal', termConfig(56)]] as const) {
    test(`${name}: crossing a threshold changes the costume once, pays the bonus, and says so`, () => {
      const start = (STAGES[1]?.at ?? 0) - 0.3
      const g0: Game = { ...playing('auto', cfg), obs: [], score: start }
      expect(g0.costume).toBe('plain')
      const g1 = step(g0, cfg)
      expect(g1.stage).toBe(1)
      expect(g1.costume).toBe(STAGES[1]?.costume)
      expect(g1.stageAge).toBe(0)
      expect(Math.abs(g1.score - (start + cfg.perTick + STAGE_BONUS))).toBeLessThan(1e-6)
      expect(g1.pops.some(p => p.kind === 'text' && p.text === `+${STAGE_BONUS}`)).toBe(true)
      // the next tick is the same stage: no second bonus
      const g2 = step({ ...g1, obs: [] }, cfg)
      expect(g2.stage).toBe(1)
      expect(Math.abs(g2.score - (g1.score + cfg.perTick))).toBeLessThan(1e-6)
      expect(g2.stageAge).toBe(1)
    })
  }

  test('a title stays up for its ticks and is then gone', () => {
    let g: Game = { ...playing('auto'), obs: [], score: (STAGES[1]?.at ?? 0) - 0.3 }
    g = step(g, deskConfig)
    for (let i = 0; i < STAGE_TICKS; i++) g = { ...step(g, deskConfig), obs: [] }
    expect(g.stageAge).toBe(STAGE_TICKS)
    g = { ...step(g, deskConfig), obs: [] }
    expect(g.stageAge).toBe(-1)
  })

  test('a costume that was named never travels, and has no titles', () => {
    let g: Game = { ...playing('pirate'), obs: [], score: (STAGES[1]?.at ?? 0) - 0.3 }
    for (let i = 0; i < 4; i++) g = { ...step(g, deskConfig), obs: [] }
    expect(g.costume).toBe('pirate')
    expect(g.stage).toBe(0)
    expect(g.stageAge).toBe(-1)
  })

  test('a whole journey, played by the pilot, goes through every stage and round again', () => {
    let g = playing('auto')
    const seen: string[] = []
    for (let i = 0; i < 20000 && g.mode === 'play'; i++) {
      g = step(pilot(g, deskConfig, { stomp: true }), deskConfig)
      if (seen.at(-1) !== g.costume) seen.push(g.costume)
    }
    expect(g.mode).toBe('play')
    expect(seen.slice(0, STAGES.length)).toEqual(STAGES.map(s => s.costume))
    expect(g.stage).toBeGreaterThan(STAGES.length)
  })
})

describe('the terminal keeps a little of each world', () => {
  test('a new stage leads the header for a moment, then the usual line is back', () => {
    const cfg = termConfig(56)
    let g: Game = { ...playing('auto', cfg), obs: [], score: (STAGES[1]?.at ?? 0) - 0.3 }
    g = step(g, cfg)
    expect(termHeader(g)).toContain(STAGES[1]?.name ?? '?')
    for (let i = 0; i < STAGE_TICKS + 2; i++) g = { ...step(g, cfg), obs: [] }
    expect(termHeader(g)).toBe(header(g))
    expect(termHeader({ ...playing('pirate', cfg), stage: 4, stageAge: 3 })).toBe(header(playing('pirate', cfg)))
  })

  test('the ambient pixels are sparse, and only worlds that have weather have them', () => {
    expect(Object.keys(AMBIENT).sort()).toEqual(['astronaut', 'detective', 'pirate', 'racer'])
    for (const a of Object.values(AMBIENT)) {
      let lit = 0
      for (let c = 0; c < 56; c++) for (let r = 0; r < 10; r++) for (let t = 0; t < 4; t++) if (a.on(c, r, t)) lit++
      // some, but far from most, of the 560 pixels
      expect(lit).toBeGreaterThan(8)
      expect(lit).toBeLessThan(4 * 560 * 0.2)
    }
    for (const id of Object.keys(GROUND)) expect(GROUND[id as keyof typeof GROUND]).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

// ---- fairness: a gauntlet can be hard, never impossible ----------------------------------------------

/** Every move of the best plan may be this many ticks off (a tick is 40 ms) and the crab still gets through. */
const SLACK = 2

const SPEEDS = [5, 6.8, 8.6]

describe('fairness: what comes at the crab can always be got past, with time to do it', () => {
  const single = (kind: Kind): Piece[] => [{ kind, after: 0 }]

  for (const kind of ['bug', 'beetle', 'moth', 'twin', 'pit', 'tower'] as const) {
    test(`a lone ${kind} leaves every move forgiving by two ticks, at every speed`, () => {
      for (const speed of SPEEDS) expect(slack(deskConfig, single(kind), speed, SLACK)).toBeGreaterThanOrEqual(SLACK)
    })
  }

  for (const gauntlet of GAUNTLETS) {
    test(`the ${gauntlet.id} gauntlet has a way through that forgives two ticks on every move, at every speed and pit width`, () => {
      for (const pit of [26, 42]) {
        const cfg: Config = { ...deskConfig, pit: { w: () => pit } }
        // from the speed the run has when it first comes, up to the top
        for (const speed of [deskConfig.speed(gauntlet.unlock), 7, 8.6]) expect(slack(cfg, gauntlet.pieces, speed, SLACK)).toBeGreaterThanOrEqual(SLACK)
      }
    })
  }

  test('the solver can say no: pits end to end, wider than any jump, are no way through', () => {
    const pits: Piece[] = Array.from({ length: 8 }, (_, i) => ({ kind: 'pit' as const, after: i === 0 ? 0 : 4 }))
    for (const speed of SPEEDS) expect(slack(deskConfig, pits, speed, SLACK)).toBeLessThan(SLACK)
    expect(slack({ ...deskConfig, pit: { w: () => 400 } }, [{ kind: 'pit', after: 0 }], 8.6, SLACK)).toBe(-1)
  })

  test('a gauntlet only uses kinds that are open by the time it comes', () => {
    for (const gauntlet of GAUNTLETS) {
      for (const p of gauntlet.pieces) expect(gauntlet.unlock).toBeGreaterThanOrEqual(deskConfig.unlock[p.kind])
    }
  })

  test('gauntlets come rarely at first, more often later, and never past the cap; the terminal has none', () => {
    expect(gauntletChance(0)).toBe(0)
    expect(gauntletChance(60)).toBe(0)
    expect(gauntletChance(600)).toBeGreaterThan(gauntletChance(300))
    expect(gauntletChance(1e6)).toBeLessThanOrEqual(0.45)
    expect(termConfig(56).gauntlet(1e6)).toBe(0)
  })

  test('obstacles reach the crab at least a whole jump apart, at the speed it has by then', () => {
    for (const seed of [3, 41, 777]) {
      let g = act(fresh(0, seed, 'ready', lookFor('plain'), deskConfig), deskConfig)
      const arrivals: { tick: number; x: number }[] = []
      const seen = new Set<number>()
      for (let i = 0; i < 4000 && g.mode === 'play'; i++) {
        g = step(pilot(g, deskConfig), deskConfig)
        for (const o of g.obs) {
          if (!seen.has(o.id) && o.x + o.w < deskConfig.crabX + deskConfig.hit[0]) {
            seen.add(o.id)
            arrivals.push({ tick: g.tick, x: o.x + o.w })
          }
        }
      }
      expect(g.mode).toBe('play')
      // consecutive obstacles that are not part of one set piece are a jump apart in time
      const gaps = arrivals.slice(1).map((a, i) => a.tick - (arrivals[i]?.tick ?? 0))
      expect(Math.min(...gaps.filter(t => t > 5))).toBeGreaterThanOrEqual(6)
    }
  })

  test('the run starts faster and denser than it did: an obstacle every second or so from the start', () => {
    let g = act(fresh(0, 9, 'ready', lookFor('plain'), deskConfig), deskConfig)
    let spawned = 0
    const seen = new Set<number>()
    for (let i = 0; i < 25 * 20 && g.mode === 'play'; i++) {
      g = step(pilot(g, deskConfig), deskConfig)
      for (const o of g.obs) if (!seen.has(o.id)) { seen.add(o.id); spawned++ }
    }
    // twenty seconds in: it was about eight bugs before, now a dozen
    expect(spawned).toBeGreaterThanOrEqual(11)
  })
})
