// A player that sees what is coming: for the tests and the preview pages, never loaded by the band.
// It centres each jump on what it clears, ducks under moths, and can aim to land on bugs instead.

import { act, fresh, lookFor, place, step } from './game'
import type { Config, Game } from './game'
import type { Piece } from './gauntlet'

export type Style = {
  /** land on the bugs (a stomp) instead of jumping clear over them */
  stomp?: boolean
}

/** The tick of a jump at which the crab, coming down, is level with `top`. */
const fallsTo = (cfg: Config, top: number): number => {
  const apex = cfg.arc.indexOf(Math.max(...cfg.arc))
  for (let i = apex; i < cfg.arc.length; i++) if ((cfg.arc[i] ?? 0) <= top) return i

  return cfg.arc.length - 1
}

export const pilot = (g: Game, cfg: Config, style: Style = {}): Game => {
  if (g.mode !== 'play') return g
  const speed = cfg.speed(g.score)
  const centre = cfg.crabX + (cfg.hit[0] + cfg.hit[1]) / 2
  const o = g.obs.find(b => b.x + b.w > cfg.crabX + cfg.hit[0] - 1)
  if (!o) return g
  // ticks until the middle of it is over the middle of the crab
  const eta = (o.x + o.w / 2 - centre) / speed
  if (o.kind === 'moth' && !style.stomp) return eta <= 8 && eta > -2 && g.duck === 0 && g.jump < 0 ? act(g, cfg, 'duck') : g
  // a jump clears it with its middle over the middle; a stomp comes down on it
  const lead = style.stomp && o.kind !== 'pit' ? fallsTo(cfg, o.base + o.h) : cfg.arc.length / 2

  return eta <= lead && g.jump < 0 ? act(g, cfg) : g
}

// ---- the fairness solver ------------------------------------------------------------------------------
// A set piece is fair when there is a way through that does not need perfect timing. `slack` finds the
// most forgiving way: a plan of one or two moves (jump or duck, each at a tick) that still gets past when
// every move is made up to `tol` ticks early or late. A tick is 40 ms on the desktop.

type Move = 'jump' | 'duck'
type Plan = readonly (readonly [tick: number, move: Move])[]

/** Whether a crab that makes these moves at these ticks gets past `obs` alive (nothing else spawns). */
const survives = (cfg: Config, obs: Game['obs'], moves: Plan): boolean => {
  let g: Game = { ...act(fresh(0, 5, 'ready', lookFor('plain'), cfg), cfg), obs, gap: 1e9, cloudGap: 1e9, orbGap: 1e9 }
  for (let t = 0; t < 140; t++) {
    for (const [at, move] of moves) if (at === t) g = act(g, cfg, move)
    g = step(g, cfg)
    if (g.mode === 'over') return false
    if (g.obs.length === 0) return true
  }

  return true
}

/** Whether `plan` works with every move shifted by anything from -tol to +tol ticks. */
const robust = (cfg: Config, obs: Game['obs'], plan: Plan, tol: number): boolean => {
  const shifts = (i: number): number[][] => {
    if (i === plan.length) return [[]]
    const rest = shifts(i + 1)
    const out: number[][] = []
    for (let d = -tol; d <= tol; d++) for (const r of rest) out.push([d, ...r])

    return out
  }

  return shifts(0).every(ds => survives(cfg, obs, plan.map(([t, m], i) => [Math.max(0, t + (ds[i] ?? 0)), m] as const)))
}

/**
 * The most ticks of slack, up to `max`, that some plan of at most two moves leaves on every move, for
 * `pieces` arriving at a constant `speed`; -1 when there is no way through at all.
 */
export const slack = (cfg: Config, pieces: readonly Piece[], speed: number, max = 4): number => {
  const fixed: Config = { ...cfg, speed: () => speed, gauntlet: () => 0, orb: null }
  const set = place(fixed, pieces, 4242, 1)
  // bring the first piece to just ahead of the crab: it arrives in about 24 ticks
  const shift = (set.obs[0]?.x ?? 0) - (cfg.crabX + cfg.hit[1] + 24 * speed)
  const obs = set.obs.map(o => ({ ...o, x: o.x - shift }))
  const moves = ['jump', 'duck'] as const
  const plans: Plan[] = []
  for (let a = 0; a <= 34; a++) {
    for (const first of moves) {
      plans.push([[a, first]])
      for (let b = a + 1; b <= a + 26; b++) for (const second of moves) plans.push([[a, first], [b, second]])
    }
  }
  let best = -1
  for (let tol = 0; tol <= max; tol++) {
    // one plan that holds is enough: the search stops at the first
    if (!plans.some(plan => robust(fixed, obs, plan, tol))) break
    best = tol
  }

  return best
}
