// The crab game's rules: one pure step function, tuned twice. The terminal plays on a grid of
// half-block pixels (a few dozen units wide, one unit a column); the desktop plays on a smooth
// vector scene (a few hundred units, one unit an art pixel). Same rules, different numbers.
// No `$`, no timers: the callers own the clock and draw the result.

import type { CostumeId, Game, GameMode, Obstacle } from '../../types'
import { ARC, HIT } from './mini'

export type { Game, GameMode, Obstacle }

export type Config = {
  /** the field's width: where an obstacle comes in */
  width: number
  /** the crab's left edge */
  crabX: number
  /** the span of the crab (from its left edge) a rock can hit: [from, to) */
  hit: readonly [from: number, to: number]
  /** lift above the ground, per tick of a jump */
  arc: readonly number[]
  /** how far into an obstacle's top the crab may be and still be clear */
  tolerance: number
  tickMs: number
  speed: (score: number) => number
  /** extra ticks, from a random number, on top of the shortest safe wait before the next obstacle
   *  (see `step`: room for a whole jump even if the run speeds up before they reach the crab) */
  gap: (r: number) => number
  firstGap: number
  /** `r` is a random number; a rock is any size from the range */
  rock: { w: (r: number) => number; h: number }
  cactus: { w: number; h: number }
}

export const ROTATION: readonly CostumeId[] = ['plain', 'astronaut', 'detective', 'engineer', 'chef', 'racer', 'pirate']

/** The terminal's tuning: cols wide, the crab nine pixels, a jump three pixels high. */
export const termConfig = (cols: number): Config => ({
  width: cols,
  crabX: 2,
  hit: [HIT.from, HIT.to + 1],
  arc: ARC,
  tolerance: 0,
  tickMs: 100,
  speed: score => (score >= 150 ? 2 : 1),
  gap: r => r % 10,
  firstGap: 12,
  rock: { w: r => 1 + (r % 2), h: 2 },
  cactus: { w: 1, h: 3 },
})

const H_JUMP = 27
const jumpArc = Array.from({ length: 9 }, (_, i) => {
  const x = (i + 1) / 10

  return Math.round(4 * H_JUMP * x * (1 - x))
})

/** The desktop's tuning: a 340 x 68 scene, the crab 30 units across, a jump 27 units high. */
export const deskConfig: Config = {
  width: 340,
  crabX: 36,
  hit: [10, 20],
  arc: jumpArc,
  tolerance: 2,
  tickMs: 70,
  speed: score => Math.min(8, 4 + Math.floor(score / 150)),
  gap: r => r % 14,
  firstGap: 22,
  rock: { w: () => 12, h: 9 },
  cactus: { w: 8, h: 18 },
}

const rand = (seed: number) => (seed * 16807) % 2147483647

export type Look = Pick<Game, 'costume' | 'auto' | 'run'>

/** Which costume a setting names, or null for "a new one every run". */
export const costumeOf = (setting: string | undefined): CostumeId | null => ROTATION.find(c => c === setting) ?? null

/** The look at the start: the named costume, or the rotation from `start`. */
export const lookFor = (setting: string | undefined, start: number): Look => {
  const named = costumeOf(setting)
  const run = Math.max(0, Math.floor(start))

  return { costume: named ?? ROTATION[run % ROTATION.length] ?? 'plain', auto: named === null, run }
}

export const fresh = (best: number, seed: number, mode: GameMode, look: Look, cfg: Config): Game => ({
  ...look,
  mode,
  tick: 0,
  y: 0,
  jump: -1,
  obs: [],
  score: 0,
  best,
  seed,
  since: 0,
  gap: cfg.firstGap,
  off: 0,
})

export const step = (g: Game, cfg: Config): Game => {
  let { jump, seed, since, gap } = g
  let y = 0
  if (jump >= 0) {
    y = cfg.arc[jump] ?? 0
    jump = jump + 1 < cfg.arc.length ? jump + 1 : -1
  }

  const speed = cfg.speed(g.score)
  const obs = g.obs.map(o => ({ ...o, x: o.x - speed })).filter(o => o.x + o.w > 0)
  const from = cfg.crabX + cfg.hit[0]
  const to = cfg.crabX + cfg.hit[1]
  const dead = obs.some(o => o.x < to && o.x + o.w > from && y < o.h - cfg.tolerance)
  const next: Game = { ...g, y, jump, obs, tick: g.tick + 1, off: g.off + speed, since: since + 1 }

  if (dead) return { ...next, mode: 'over', best: Math.max(g.best, g.score) }
  if (next.since >= gap) {
    seed = rand(seed)
    const tall = g.score >= 60 && seed % 3 === 0
    seed = rand(seed)
    const w = tall ? cfg.cactus.w : cfg.rock.w(seed)
    seed = rand(seed)
    // two obstacles this far apart are a whole jump apart even at the run's top speed
    gap = Math.ceil(((cfg.arc.length + 4) * cfg.speed(Number.MAX_SAFE_INTEGER)) / speed) + cfg.gap(seed)
    next.obs = [...obs, { x: cfg.width, w, h: tall ? cfg.cactus.h : cfg.rock.h, tall }]
    next.since = 0
    next.gap = gap
    next.seed = seed
  }

  return { ...next, score: g.score + 1 }
}

/** A press: start a run, retry after one, or jump. */
export const act = (g: Game, cfg: Config): Game => {
  if (g.mode === 'ready') return fresh(g.best, g.seed, 'play', g, cfg)
  if (g.mode === 'over') {
    const run = g.auto ? g.run + 1 : g.run
    const costume = g.auto ? (ROTATION[run % ROTATION.length] ?? g.costume) : g.costume

    return fresh(g.best, g.seed, 'play', { ...g, run, costume }, cfg)
  }
  if (g.jump < 0) return { ...g, jump: 0 }

  return g
}

const num = (n: number) => String(n).padStart(4, '0')

/** The line above the field. */
export const header = (g: Game): string => {
  if (g.mode === 'play') return ` score ${num(g.score)} · best ${num(g.best)} · space / ↑ / click to jump`
  if (g.mode === 'over') return ` game over ${num(g.score)} · best ${num(g.best)} · space retry · q close`

  return ` ${g.costume} · best ${num(g.best)} · space / ↑ / click to start · q close`
}
