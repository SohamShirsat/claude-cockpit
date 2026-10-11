import { describe, expect, test } from 'claude-code/testing'

import { act, ahead, COSTUME_IDS, deskConfig, fresh, lookFor, step } from './game'
import type { Game } from './game'
import { pilot } from './pilot'
import { motionSvg, sceneSvg } from './scene'
import { STAGES } from './stages'
import { THEMES, themeOf } from './themes'

const SIZE = { width: 840, height: 144 }

// ---- contrast: what is behind the play must not hide it ----------------------------------------------------

const luminance = (hex: string): number => {
  const n = Number.parseInt(hex.slice(1), 16)
  const lin = (v: number) => {
    const c = v / 255

    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)

  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

const worst = (colors: readonly string[], against: string): number => Math.min(...colors.map(c => contrast(c, against)))

// the main color of what the player has to see, from scene.ts
const CRAB = '#D97757'
const BUG = '#C0392B'
const BEETLE = '#3B9C5F'
const CLOUD = '#9CCBF2'
const ORB = '#4CB878'

describe('themes: one world a costume', () => {
  test('every costume has a world, and the journey names are the worlds', () => {
    expect(Object.keys(THEMES).sort()).toEqual([...COSTUME_IDS].sort())
    for (const stage of STAGES) expect(themeOf(stage.costume).name).toBe(stage.name)
    for (const t of Object.values(THEMES)) {
      expect(t.id).toBe(themeOf(t.id).id)
      for (const far of t.far) expect(far.k).toBeGreaterThan(0)
    }
  })

  test('the text over a world can be read, and the bugs and the crab stand out from what is behind them', () => {
    for (const t of Object.values(THEMES)) {
      if (!t.sky || !t.lane || !t.ink.strong || !t.ink.dim) continue
      for (const band of t.sky) {
        expect(contrast(band, t.ink.strong)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(band, t.ink.dim)).toBeGreaterThanOrEqual(4)
      }
      const behind = [...t.lane, ...t.sky]
      // what stands on the ground: against the sky and the scenery behind it
      expect(worst(behind, CRAB)).toBeGreaterThanOrEqual(1.35)
      expect(worst(behind, BUG)).toBeGreaterThanOrEqual(1.7)
      expect(worst(behind, BEETLE)).toBeGreaterThanOrEqual(1.4)
      // what flies at the top: against the sky
      expect(worst(t.sky, CLOUD)).toBeGreaterThanOrEqual(1.2)
      expect(worst(t.sky, ORB)).toBeGreaterThanOrEqual(1.7)
    }
  })

  test('every world draws a standalone svg that is balanced and small, with its title only when it is a new stage', () => {
    for (const [i, stage] of STAGES.entries()) {
      const cfg = deskConfig
      const g: Game = { ...fresh(0, 3, 'play', lookFor('auto'), cfg), costume: stage.costume, stage: i, stageAge: i > 0 ? 10 : -1, off: 500 }
      const svg = sceneSvg(g, cfg, SIZE)
      expect(svg.match(/<g[ >]/g)?.length).toBe(svg.match(/<\/g>/g)?.length)
      expect((svg.match(/</g) ?? []).length).toBe((svg.match(/>/g) ?? []).length)
      expect(svg).not.toMatch(/NaN|undefined|Infinity/)
      expect(svg.length).toBeLessThan(30000)
      expect(svg.includes(`>${stage.name}</text>`)).toBe(i > 0)
    }
    // a crab that wears one costume for the whole run never gets titles
    const pinned = sceneSvg({ ...fresh(0, 3, 'play', lookFor('pirate'), deskConfig), stage: 3, stageAge: 4 }, deskConfig, SIZE)
    expect(pinned).not.toContain('class="bn"')
  })

  test('weather and the like loop by themselves, are switched off by reduced motion, and use ids that are their own', () => {
    for (const id of ['detective', 'pirate', 'swimmer', 'astronaut'] as const) {
      const svg = sceneSvg({ ...fresh(0, 3, 'play', lookFor(id), deskConfig), tick: 3 }, deskConfig, SIZE)
      expect(svg).toContain('repeatCount="indefinite"')
      expect(svg).toContain('class="fx"')
    }
    expect(sceneSvg(fresh(0, 3, 'play', lookFor('plain'), deskConfig), deskConfig, SIZE)).toContain('prefers-reduced-motion: reduce){.fx{display:none}}')
    for (const id of COSTUME_IDS) {
      const svg = motionSvg({ states: ahead({ ...act(fresh(0, 3, 'ready', lookFor(id), deskConfig), deskConfig), off: 900 }, deskConfig, 96), phase: 0.3 }, deskConfig, SIZE)
      const ids = svg.match(/ id="[^"]+"/g) ?? []
      expect(new Set(ids).size).toBe(ids.length)
      // every pattern that is used is defined
      for (const ref of svg.match(/url\(#[^)]+\)/g) ?? []) expect(svg).toContain(` id="${ref.slice(5, -1)}"`)
    }
  })
})

describe('the journey in the picture: a stage that changes inside a plan', () => {
  /** A plan that starts `before` ticks before the score reaches `at` (play it with the pilot). */
  const planAcross = (at: number, before: number, ticks = 192): Game[] => {
    let g = act(fresh(0, 11, 'ready', lookFor('auto'), deskConfig), deskConfig)
    for (let i = 0; i < 20000 && g.score < at - before * 0.6; i++) g = step(pilot(g, deskConfig, { stomp: true }), deskConfig)
    const states = [g]
    for (let i = 0; i < ticks; i++) {
      const last = states[states.length - 1] ?? g
      states.push(last.mode === 'play' ? step(pilot(last, deskConfig, { stomp: true }), deskConfig) : last)
    }

    return states
  }

  for (const at of [1, 3, 5, 7].map(i => STAGES[i]?.at ?? 0)) {
    test(`across a stage change at ${at}: both crabs, both worlds, the ink and the title, balanced and well inside the budget`, () => {
      const states = planAcross(at, 40)
      const cuts = states.map((s, j) => (j > 0 && s.costume !== states[j - 1]?.costume ? j : 0)).filter(Boolean)
      expect(cuts.length).toBeGreaterThanOrEqual(1)
      const svg = motionSvg({ states, phase: 0.4 }, deskConfig, SIZE)
      expect(svg.match(/<g[ >]/g)?.length).toBe(svg.match(/<\/g>/g)?.length)
      expect((svg.match(/</g) ?? []).length).toBe((svg.match(/>/g) ?? []).length)
      expect(svg).not.toMatch(/NaN|undefined|Infinity/)
      // the old world fades out over the new one
      expect(svg).toMatch(/<animate attributeName="opacity" values="1;0"/)
      // the text takes the new world's ink
      expect(svg).toContain('attributeName="fill"')
      // the stage's title comes in, and its name is the new world's
      const name = STAGES.find(s => s.costume === states[cuts[0] ?? 0]?.costume)?.name ?? ''
      expect(svg).toContain(`>${name}</text>`)
      // a plan that crosses a stage is bigger than one that does not, but stays inside what the surface takes
      expect(svg.length).toBeLessThan(110000)
    })
  }

  test('a plan that begins just after a change carries on the old world\'s fade instead of cutting it', () => {
    const states = planAcross(STAGES[3]?.at ?? 0, 40)
    const at = states.findIndex(s => s.stageAge === 3)
    expect(at).toBeGreaterThan(0)
    const svg = motionSvg({ states: states.slice(at), phase: 0 }, deskConfig, SIZE)
    // the old world is still there, part-way through going: it starts below full opacity and ends at zero
    expect(svg).toMatch(/<g[^>]* opacity="0\.\d+"[^>]*>(<set|<animate)[^]*?<animate attributeName="opacity" values="0\.\d+;0"/)
    // and a plan that begins well after has only the one world
    const later = motionSvg({ states: states.slice(at + 30, at + 60), phase: 0 }, deskConfig, SIZE)
    expect(later).not.toMatch(/<animate attributeName="opacity" values="[\d.]+;0" dur/)
  })

  test('the plan agrees with the rules: the crab it draws is the costume the game says, tick by tick', () => {
    const states = planAcross(STAGES[2]?.at ?? 0, 30)
    const svg = motionSvg({ states, phase: 0 }, deskConfig, SIZE)
    const costumes = [...new Set(states.map(s => s.costume))]
    expect(costumes.length).toBeGreaterThanOrEqual(2)
    // one crab body per costume it wears, each shown only for its own ticks
    expect(svg.match(/<animate attributeName="visibility"/g)?.length).toBeGreaterThanOrEqual(costumes.length)
  })

  test('the longest plan, at top speed in the busiest world, stays inside the budget', () => {
    for (const id of ['plain', 'swimmer', 'chef', 'engineer', 'detective', 'pirate'] as const) {
      let g = act(fresh(0, 9, 'ready', lookFor(id), deskConfig), deskConfig)
      g = { ...g, score: 3000 }
      for (let i = 0; i < 200; i++) g = step(pilot(g, deskConfig, { stomp: true }), deskConfig)
      expect(motionSvg({ states: ahead(g, deskConfig, 192), phase: 0.7 }, deskConfig, SIZE).length).toBeLessThan(100000)
    }
  })
})
