// The crab game's rules: one pure step function, tuned twice. The terminal plays on a grid of
// half-block pixels (a few dozen units wide, one unit a column); the desktop plays on a smooth
// vector scene (a few hundred units, one unit an art pixel). Same rules, different numbers.
// No `$`, no timers: the callers own the clock and draw the result.

import type { Cloud, CostumeId, Game, GameMode, Obstacle } from '../../types'
import { ARC, HIT } from './mini'

export type { Cloud, Game, GameMode, Obstacle }

export type Config = {
  /** the field's width: where an obstacle comes in */
  width: number
  /** the crab's left edge */
  crabX: number
  /** the span of the crab (from its left edge) a bug can hit: [from, to) */
  hit: readonly [from: number, to: number]
  /** how much of a bug's width, each side, is only legs and feelers: it cannot hurt */
  pad: number
  /** the span of the crab (from its left edge) that can grab a cloud, and how tall the crab is */
  reach: readonly [from: number, to: number]
  crabH: number
  /** lift above the ground, per tick of a jump */
  arc: readonly number[]
  /** how far into an obstacle's top the crab may be and still be clear */
  tolerance: number
  tickMs: number
  /** points a tick of running is worth, and a grabbed cloud */
  perTick: number
  cloudPoints: number
  speed: (score: number) => number
  /** extra ticks, from a random number, on top of the shortest safe wait before the next obstacle
   *  (see `step`: room for a whole jump even if the run speeds up before they reach the crab) */
  gap: (r: number) => number
  firstGap: number
  /** `r` is a random number; a bug is any size from the range */
  bug: { w: (r: number) => number; h: number }
  big: { w: number; h: number }
  /** clouds: how wide and tall, the height of the underside (from `r`) and the wait (in ticks) for the next */
  cloud: { w: number; th: number; h: (r: number) => number; gap: (r: number) => number; first: number }
}

export const ROTATION: readonly CostumeId[] = ['plain', 'astronaut', 'detective', 'engineer', 'chef', 'racer', 'pirate']

/** The terminal's tuning: cols wide, the crab nine pixels, a jump three pixels high. */
export const termConfig = (cols: number): Config => ({
  width: cols,
  crabX: 2,
  hit: [HIT.from, HIT.to + 1],
  pad: 0,
  reach: [1, 8],
  crabH: 7,
  arc: ARC,
  tolerance: 0,
  tickMs: 60,
  perTick: 1,
  cloudPoints: 25,
  speed: score => (score >= 200 ? 2 : 1),
  gap: r => r % 12,
  firstGap: 16,
  bug: { w: r => 1 + (r % 2), h: 2 },
  big: { w: 1, h: 3 },
  cloud: { w: 4, th: 1, h: () => 9, gap: r => 40 + (r % 40), first: 30 },
})

const H_JUMP = 30
const JUMP_TICKS = 17
// a smooth parabola, a fraction of a unit per tick: the crab glides instead of stepping
const jumpArc = Array.from({ length: JUMP_TICKS }, (_, i) => {
  const x = (i + 1) / (JUMP_TICKS + 1)

  return Math.round(4 * H_JUMP * x * (1 - x) * 10) / 10
})

/** The desktop's tuning: a 340 x 68 scene, the crab 30 units across, a jump 30 units high, 25 frames a second. */
export const deskConfig: Config = {
  width: 340,
  crabX: 36,
  hit: [10, 20],
  pad: 2,
  reach: [4, 26],
  crabH: 24,
  arc: jumpArc,
  tolerance: 2,
  tickMs: 40,
  perTick: 0.6,
  cloudPoints: 25,
  // 75 units a second to start, quickening smoothly to 140
  speed: score => Math.min(5.6, 3 + score / 450),
  gap: r => r % 24,
  firstGap: 18,
  bug: { w: () => 12, h: 9 },
  big: { w: 12, h: 13 },
  cloud: { w: 16, th: 8, h: r => 34 + (r % 15), gap: r => 45 + (r % 55), first: 40 },
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
  queued: false,
  obs: [],
  clouds: [],
  pops: [],
  grabbed: 0,
  score: 0,
  best,
  seed,
  since: 0,
  gap: cfg.firstGap,
  sinceCloud: 0,
  cloudGap: cfg.cloud.first,
  off: 0,
})

/** A press this many ticks before landing queues the next jump. */
const QUEUE_TICKS = 6

/** How many ticks the sparkle of a grabbed cloud lasts. */
export const POP_TICKS = 9

export const step = (g: Game, cfg: Config): Game => {
  let { jump, seed, since, gap, sinceCloud, cloudGap, queued } = g
  let y = 0
  if (jump >= 0) {
    y = cfg.arc[jump] ?? 0
    jump = jump + 1 < cfg.arc.length ? jump + 1 : -1
  }
  // a press made just before landing is not lost: the next jump goes the moment the crab is down
  if (jump < 0 && queued) {
    jump = 0
    queued = false
  }

  const speed = cfg.speed(g.score)
  const obs = g.obs.map(o => ({ ...o, x: o.x - speed })).filter(o => o.x + o.w > 0)
  const from = cfg.crabX + cfg.hit[0]
  const to = cfg.crabX + cfg.hit[1]
  const dead = obs.some(o => o.x + cfg.pad < to && o.x + o.w - cfg.pad > from && y < o.h - cfg.tolerance)

  // clouds drift in with the ground; the crab grabs one by reaching it in a jump
  const reach = [cfg.crabX + cfg.reach[0], cfg.crabX + cfg.reach[1]] as const
  const pops = g.pops.map(p => ({ ...p, age: p.age + 1 })).filter(p => p.age < POP_TICKS)
  const clouds: Cloud[] = []
  let caught = 0
  for (const c of g.clouds) {
    const x = c.x - speed
    if (x + c.w <= 0) continue
    const touched = !dead && x < reach[1] && x + c.w > reach[0] && y + cfg.crabH >= c.h && y <= c.h + cfg.cloud.th
    if (touched) {
      caught++
      pops.push({ x: x + c.w / 2, h: c.h, age: 0 })
    } else {
      clouds.push({ ...c, x })
    }
  }

  const next: Game = {
    ...g,
    y,
    jump,
    queued,
    obs,
    clouds,
    pops,
    grabbed: g.grabbed + caught,
    tick: g.tick + 1,
    off: g.off + speed,
    since: since + 1,
    sinceCloud: sinceCloud + 1,
  }

  if (dead) return { ...next, mode: 'over', best: Math.max(g.best, Math.floor(g.score)) }
  if (next.since >= gap) {
    seed = rand(seed)
    const tall = g.score >= 60 && seed % 3 === 0
    seed = rand(seed)
    const w = tall ? cfg.big.w : cfg.bug.w(seed)
    seed = rand(seed)
    // two bugs this far apart are a whole jump apart even at the run's top speed
    gap = Math.ceil(((cfg.arc.length + 4) * cfg.speed(Number.MAX_SAFE_INTEGER)) / speed) + cfg.gap(seed)
    next.obs = [...obs, { x: cfg.width, w, h: tall ? cfg.big.h : cfg.bug.h, tall }]
    next.since = 0
    next.gap = gap
  }
  if (next.sinceCloud >= cloudGap) {
    seed = rand(seed)
    const h = cfg.cloud.h(seed)
    seed = rand(seed)
    next.clouds = [...clouds, { x: cfg.width, w: cfg.cloud.w, h }]
    next.sinceCloud = 0
    next.cloudGap = cfg.cloud.gap(seed)
  }
  next.seed = seed

  return { ...next, score: g.score + cfg.perTick + caught * cfg.cloudPoints }
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
  if (g.jump >= cfg.arc.length - QUEUE_TICKS) return { ...g, queued: true }

  return g
}

const num = (n: number) => String(Math.floor(n)).padStart(4, '0')

/** The one line of guidance above the field: what to do, the score, and the key to press. */
export const header = (g: Game, keys = 'space / ↑'): string => {
  if (g.mode === 'play') return ` score ${num(g.score)} · ☁ ${g.grabbed} · best ${num(g.best)} · ${keys} to jump`
  if (g.mode === 'over') return ` game over ${num(g.score)} · ☁ ${g.grabbed} · best ${num(g.best)} · ${keys} to retry`

  return ` ${g.costume} · grab ☁, dodge bugs · ${keys} to start`
}
