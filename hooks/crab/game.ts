// The crab game's rules: one pure step function, tuned twice. The terminal plays on a grid of
// half-block pixels (a few dozen units wide, one unit a column); the desktop plays on a smooth
// vector scene (a few hundred units, one unit an art pixel). Same rules, different numbers.
// No `$`, no timers: the callers own the clock and draw the result.
//
// The story: the crab is Claude, and these are bugs. Jump them, stomp them (a bug you land on is
// fixed), duck under the moths, hop the segfault pits, and grab the clouds and the green shield.

import type { Cloud, CostumeId, Game, GameMode, Kind, Obstacle, Pop } from '../../types'
import { ARC, HIT } from './mini'

export type { Cloud, Game, GameMode, Kind, Obstacle, Pop }

export type Config = {
  /** the field's width: where an obstacle comes in */
  width: number
  /** the crab's left edge */
  crabX: number
  /** the span of the crab (from its left edge) a bug can hit: [from, to) */
  hit: readonly [from: number, to: number]
  /** how much of a bug's width, each side, is only legs and feelers: it cannot hurt */
  pad: number
  /** the span of the crab (from its left edge) that can grab a cloud, and how tall the crab is (standing, ducking) */
  reach: readonly [from: number, to: number]
  crabH: number
  duckH: number
  /** lift above the ground, per tick of a jump */
  arc: readonly number[]
  /** how far into an obstacle's top the crab may be and still be clear */
  tolerance: number
  tickMs: number
  /** points a tick of running is worth, and a grabbed cloud */
  perTick: number
  cloudPoints: number
  /** points for fixing a bug by landing on it (times the combo); 0 turns stomping off */
  stomp: number
  /** how many ticks a duck lasts; 0 turns ducking off (a duck key jumps instead) */
  duckTicks: number
  /** how many ticks a spent shield keeps the crab safe */
  invTicks: number
  speed: (score: number) => number
  /** extra ticks, from a random number, on top of the shortest safe wait before the next obstacle
   *  (see `step`: room for a whole jump even if the run speeds up before they reach the crab) */
  gap: (r: number) => number
  firstGap: number
  /** which obstacles exist, the score each starts at, and how often each comes */
  kinds: readonly Kind[]
  unlock: Record<Kind, number>
  weight: Record<Kind, number>
  /** `r` is a random number; a bug is any size from the range */
  bug: { w: (r: number) => number; h: number }
  big: { w: number; h: number }
  moth: { w: number; h: number; base: number }
  twin: { w: number }
  pit: { w: (r: number) => number }
  /** clouds: how wide and tall, the height of the underside (from `r`) and the wait (in ticks) for the next */
  cloud: { w: number; th: number; h: (r: number) => number; gap: (r: number) => number; first: number }
  /** the shield orb, or null when there is none */
  orb: { w: number; th: number; h: (r: number) => number; gap: (r: number) => number; first: number } | null
  /** say what each new kind of bug is the first time it comes */
  notes: boolean
}

export const ROTATION: readonly CostumeId[] = ['plain', 'astronaut', 'detective', 'engineer', 'chef', 'racer', 'pirate']

const ALL: Record<Kind, number> = { bug: 0, beetle: 0, moth: 0, twin: 0, pit: 0 }

/** The terminal's tuning: cols wide, the crab nine pixels, a jump three pixels high; just bugs and clouds. */
export const termConfig = (cols: number): Config => ({
  width: cols,
  crabX: 2,
  hit: [HIT.from, HIT.to + 1],
  pad: 0,
  reach: [1, 8],
  crabH: 7,
  duckH: 7,
  arc: ARC,
  tolerance: 0,
  tickMs: 60,
  perTick: 1,
  cloudPoints: 25,
  stomp: 0,
  duckTicks: 0,
  invTicks: 0,
  speed: score => (score >= 200 ? 2 : 1),
  gap: r => r % 12,
  firstGap: 16,
  kinds: ['bug', 'beetle'],
  unlock: { ...ALL, beetle: 60 },
  weight: { ...ALL, bug: 4, beetle: 2 },
  bug: { w: r => 1 + (r % 2), h: 2 },
  big: { w: 1, h: 3 },
  moth: { w: 1, h: 1, base: 3 },
  twin: { w: 3 },
  pit: { w: () => 3 },
  cloud: { w: 4, th: 1, h: () => 9, gap: r => 40 + (r % 40), first: 30 },
  orb: null,
  notes: false,
})

const H_JUMP = 30
const JUMP_TICKS = 17
// a smooth parabola, a fraction of a unit per tick: the crab glides instead of stepping
const jumpArc = Array.from({ length: JUMP_TICKS }, (_, i) => {
  const x = (i + 1) / (JUMP_TICKS + 1)

  return Math.round(4 * H_JUMP * x * (1 - x) * 10) / 10
})

/** How wide the desktop field is, in units, by default; it is made as wide as the band when a run starts. */
export const FIELD = { min: 260, max: 520, normal: 420 } as const

/**
 * The desktop's tuning for a field `width` units wide: the crab 30 units across, a jump 30 units
 * high, 25 steps a second. A wider field gives more to look at, never a longer wait: obstacles come
 * in from the right edge, and the speeds are set so the way across takes the same few seconds.
 */
export const deskConfigFor = (width: number): Config => ({
  width,
  crabX: 36,
  hit: [10, 20],
  pad: 2,
  reach: [4, 26],
  crabH: 24,
  duckH: 11,
  arc: jumpArc,
  tolerance: 2,
  tickMs: 40,
  perTick: 0.6,
  cloudPoints: 25,
  stomp: 10,
  duckTicks: 16,
  invTicks: 30,
  // 100 units a second to start, quickening smoothly to 185
  speed: score => Math.min(7.4, 4 + score / 400),
  gap: r => r % 24,
  firstGap: 18,
  kinds: ['bug', 'beetle', 'moth', 'twin', 'pit'],
  unlock: { bug: 0, beetle: 60, moth: 110, twin: 180, pit: 260 },
  weight: { bug: 5, beetle: 3, moth: 4, twin: 3, pit: 3 },
  bug: { w: () => 12, h: 9 },
  big: { w: 12, h: 13 },
  moth: { w: 14, h: 9, base: 11 },
  twin: { w: 27 },
  pit: { w: r => 26 + (r % 5) * 4 },
  cloud: { w: 16, th: 8, h: r => 34 + (r % 15), gap: r => 45 + (r % 55), first: 40 },
  orb: { w: 10, th: 10, h: r => 24 + (r % 12), gap: r => 450 + (r % 400), first: 330 },
  notes: true,
})

export const deskConfig: Config = deskConfigFor(FIELD.normal)

/** What the first of each kind says. */
export const NOTES: Record<Kind | 'orb', string> = {
  bug: 'bug! jump it, or land on it to fix it',
  beetle: 'big beetle! more points if you stomp it',
  moth: 'moth! duck under it with ↓ or J',
  twin: 'twin bugs! one long jump',
  pit: 'segfault! jump the gap',
  orb: 'tests passing! grab the shield',
}

export const NOTE_TICKS = 75

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
  dive: false,
  duck: 0,
  queued: false,
  obs: [],
  clouds: [],
  pops: [],
  nid: 1,
  grabbed: 0,
  fixed: 0,
  combo: 0,
  shield: false,
  inv: 0,
  seen: [],
  note: '',
  noteAge: -1,
  cause: '',
  score: 0,
  best,
  seed,
  since: 0,
  gap: cfg.firstGap,
  sinceCloud: 0,
  cloudGap: cfg.cloud.first,
  sinceOrb: 0,
  orbGap: cfg.orb?.first ?? 0,
  off: 0,
})

/** A press this many ticks before landing queues the next jump. */
const QUEUE_TICKS = 6

/** How many ticks each kind of burst lasts. */
export const POP_LIFE = { spark: 9, poof: 10, text: 26 } as const
/** The sparkle's length, for the callers that only know about clouds. */
export const POP_TICKS = POP_LIFE.spark

/** How close to the ground a crab has to be, in a pit, to fall. */
const PIT_CLEAR = 2

/** The index of the arc, going up, that is first at least `h` high: where a bounce off a bug picks up the jump. */
const bounceFrom = (cfg: Config, h: number): number => {
  const apex = cfg.arc.indexOf(Math.max(...cfg.arc))
  for (let i = 0; i <= apex; i++) if ((cfg.arc[i] ?? 0) >= h) return i

  return apex
}

const pick = (cfg: Config, score: number, seed: number): Kind => {
  const open = cfg.kinds.filter(k => score >= cfg.unlock[k])
  const total = open.reduce((n, k) => n + cfg.weight[k], 0)
  let r = seed % Math.max(1, total)
  for (const k of open) {
    if (r < cfg.weight[k]) return k
    r -= cfg.weight[k]
  }

  return 'bug'
}

export const step = (g: Game, cfg: Config): Game => {
  let { jump, dive, duck, seed, since, gap, sinceCloud, cloudGap, sinceOrb, orbGap, queued, nid, combo, shield, inv } = g
  let y = 0
  if (jump >= 0) {
    y = cfg.arc[Math.min(jump, cfg.arc.length - 1)] ?? 0
    jump += dive ? 2 : 1
    if (jump >= cfg.arc.length) {
      jump = -1
      dive = false
    }
  }
  // a press made just before landing is not lost: the next jump goes the moment the crab is down
  if (jump < 0 && queued) {
    jump = 0
    queued = false
  }
  if (g.jump < 0) combo = 0
  const ducking = g.duck > 0 && g.jump < 0
  if (duck > 0) duck--
  if (inv > 0) inv--
  const crabH = ducking ? cfg.duckH : cfg.crabH

  const speed = cfg.speed(g.score)
  let obs = g.obs.map(o => ({ ...o, x: o.x - speed })).filter(o => o.x + o.w > 0)
  const from = cfg.crabX + cfg.hit[0]
  const to = cfg.crabX + cfg.hit[1]
  const centre = (from + to) / 2

  const pops: Pop[] = g.pops.map(p => ({ ...p, age: p.age + 1 })).filter(p => p.age < POP_LIFE[p.kind])
  let dead = false
  let cause: Game['cause'] = ''
  let fixed = 0
  let bonus = 0
  const gone = new Set<number>()
  for (const o of obs) {
    const top = o.base + o.h
    const hit = o.kind === 'pit'
      ? y < PIT_CLEAR && o.x + 2 < centre && centre < o.x + o.w - 2
      : o.x + cfg.pad < to && o.x + o.w - cfg.pad > from
        && y < top - cfg.tolerance && y + crabH > o.base + cfg.tolerance
    const stomped = cfg.stomp > 0 && o.kind !== 'pit' && y < g.y && g.y > top - 1 && o.x + cfg.pad < to && o.x + o.w - cfg.pad > from
    if (stomped && !gone.has(o.id) && !dead) {
      // a bug landed on is a bug fixed: it goes, the crab bounces off, and landing several in a row pays more
      const points = cfg.stomp * (combo + 1) * (o.kind === 'twin' || o.kind === 'beetle' ? 2 : 1)
      gone.add(o.id)
      fixed++
      bonus += points
      pops.push({ id: nid++, x: o.x + o.w / 2, h: top, age: 0, kind: 'poof' })
      pops.push({ id: nid++, x: o.x + o.w / 2 - 6, h: top + 6, age: 0, kind: 'text', text: combo > 0 ? `x${combo + 1} +${points}` : `+${points}` })
      combo++
      const at = bounceFrom(cfg, top + 3)
      y = cfg.arc[at] ?? y
      jump = at + 1
      dive = false
      duck = 0
    } else if (hit && !stomped && inv === 0 && !gone.has(o.id)) {
      if (shield) {
        // the shield takes the hit: the bug is blasted, the crab hops clear of a pit, and the shield is gone
        shield = false
        inv = cfg.invTicks
        gone.add(o.id)
        fixed++
        pops.push({ id: nid++, x: o.x + o.w / 2, h: top, age: 0, kind: 'poof' })
        if (o.kind === 'pit' && jump < 0) {
          y = cfg.arc[0] ?? 0
          jump = 1
        }
      } else {
        dead = true
        cause = o.kind === 'pit' ? 'pit' : 'hit'
      }
    }
  }
  obs = obs.filter(o => !gone.has(o.id))

  // clouds drift in with the ground; the crab grabs one by reaching it in a jump
  const reach = [cfg.crabX + cfg.reach[0], cfg.crabX + cfg.reach[1]] as const
  const clouds: Cloud[] = []
  let caught = 0
  for (const c of g.clouds) {
    const x = c.x - speed
    if (x + c.w <= 0) continue
    const th = c.t ?? cfg.cloud.th
    const touched = !dead && x < reach[1] && x + c.w > reach[0] && y + crabH >= c.h && y <= c.h + th
    if (touched) {
      pops.push({ id: nid++, x: x + c.w / 2, h: c.h, age: 0, kind: 'spark' })
      if (c.shield) {
        shield = true
        pops.push({ id: nid++, x: x + c.w / 2 - 14, h: c.h + 8, age: 0, kind: 'text', text: 'shield!' })
      } else {
        caught++
      }
    } else {
      clouds.push({ ...c, x })
    }
  }

  const next: Game = {
    ...g,
    y,
    jump,
    dive,
    duck,
    queued,
    obs,
    clouds,
    pops,
    nid,
    combo,
    shield,
    inv,
    grabbed: g.grabbed + caught,
    fixed: g.fixed + fixed,
    tick: g.tick + 1,
    off: g.off + speed,
    since: since + 1,
    sinceCloud: sinceCloud + 1,
    sinceOrb: sinceOrb + 1,
    noteAge: g.noteAge >= 0 && g.noteAge < NOTE_TICKS ? g.noteAge + 1 : -1,
  }
  if (next.noteAge < 0) next.note = ''

  const score = g.score + cfg.perTick + caught * cfg.cloudPoints + bonus
  if (dead) return { ...next, mode: 'over', cause, score, best: Math.max(g.best, Math.floor(g.score)) }

  // the first of each kind says what it is
  const say = (kind: Kind | 'orb') => {
    if (!cfg.notes || next.seen.includes(kind)) return
    next.seen = [...next.seen, kind]
    next.note = NOTES[kind]
    next.noteAge = 0
  }

  if (next.since >= gap) {
    seed = rand(seed)
    const kind = pick(cfg, g.score, seed)
    seed = rand(seed)
    const w = kind === 'beetle' ? cfg.big.w : kind === 'moth' ? cfg.moth.w : kind === 'twin' ? cfg.twin.w : kind === 'pit' ? cfg.pit.w(seed) : cfg.bug.w(seed)
    const h = kind === 'beetle' ? cfg.big.h : kind === 'moth' ? cfg.moth.h : kind === 'pit' ? 0 : cfg.bug.h
    const base = kind === 'moth' ? cfg.moth.base : 0
    seed = rand(seed)
    // two obstacles this far apart are a whole jump apart even at the run's top speed
    gap = Math.ceil(((cfg.arc.length + 4) * cfg.speed(Number.MAX_SAFE_INTEGER)) / speed) + cfg.gap(seed) + Math.ceil(w / speed)
    next.obs = [...obs, { id: next.nid++, x: cfg.width, w, h, base, tall: kind === 'beetle', kind }]
    next.since = 0
    next.gap = gap
    say(kind)
  }
  if (next.sinceCloud >= cloudGap) {
    seed = rand(seed)
    const h = cfg.cloud.h(seed)
    seed = rand(seed)
    next.clouds = [...next.clouds, { id: next.nid++, x: cfg.width, w: cfg.cloud.w, h }]
    next.sinceCloud = 0
    next.cloudGap = cfg.cloud.gap(seed)
  }
  if (cfg.orb && !shield && next.sinceOrb >= orbGap && !next.clouds.some(c => c.shield)) {
    seed = rand(seed)
    const h = cfg.orb.h(seed)
    seed = rand(seed)
    next.clouds = [...next.clouds, { id: next.nid++, x: cfg.width, w: cfg.orb.w, h, t: cfg.orb.th, shield: true }]
    next.sinceOrb = 0
    next.orbGap = cfg.orb.gap(seed)
    say('orb')
  }
  next.seed = seed

  return { ...next, score }
}

/** A press: start a run, retry after one, or jump (or, with `duck`, duck; in the air, dive). */
export const act = (g: Game, cfg: Config, move: 'jump' | 'duck' = 'jump'): Game => {
  if (g.mode === 'ready') return fresh(g.best, g.seed, 'play', g, cfg)
  if (g.mode === 'over') {
    const run = g.auto ? g.run + 1 : g.run
    const costume = g.auto ? (ROTATION[run % ROTATION.length] ?? g.costume) : g.costume

    return fresh(g.best, g.seed, 'play', { ...g, run, costume }, cfg)
  }
  if (move === 'duck' && cfg.duckTicks > 0) {
    if (g.jump < 0) return g.duck > 0 ? g : { ...g, duck: cfg.duckTicks, queued: false }
    if (g.dive) return g
    // down in the air: drop at once, from the same height on the way down, twice as fast
    return { ...g, dive: true, queued: false, jump: g.jump * 2 < cfg.arc.length - 1 ? cfg.arc.length - 1 - g.jump : g.jump }
  }
  if (g.jump < 0) return { ...g, jump: 0, duck: 0 }
  if (g.jump >= cfg.arc.length - QUEUE_TICKS) return g.queued ? g : { ...g, queued: true }

  return g
}

/** The run from `g` as it will go if nothing is pressed: `ticks` steps ahead, the first state being `g`, and it stops at the end of a run. */
export const ahead = (g: Game, cfg: Config, ticks: number): Game[] => {
  const out: Game[] = [g]
  for (let i = 0; i < ticks; i++) {
    const last = out[out.length - 1] ?? g
    out.push(last.mode === 'play' ? step(last, cfg) : last)
  }

  return out
}

const num = (n: number) => String(Math.floor(n)).padStart(4, '0')

/** The one line of guidance above the field: what to do, the score, and the key to press. */
export const header = (g: Game, keys = 'space / ↑'): string => {
  const fixed = g.fixed > 0 ? ` · ✓ ${g.fixed}` : ''
  if (g.mode === 'play') return ` score ${num(g.score)} · ☁ ${g.grabbed}${fixed} · best ${num(g.best)} · ${keys} to jump`
  if (g.mode === 'over') return ` game over ${num(g.score)} · ☁ ${g.grabbed}${fixed} · best ${num(g.best)} · ${keys} to retry`

  return ` ${g.costume} · grab ☁, dodge or fix bugs · ${keys} to start`
}

/**
 * The desktop's one line of guidance. While a run plays the picture counts the score itself, so the
 * line says only what the keys do: it is then the same line for the whole run, and the band is not
 * redrawn for it.
 */
export const deskLine = (g: Game, keys = 'space / ↑'): string =>
  g.mode === 'play' ? ` ${keys} to jump · ↓ or J to duck · Q to close` : header(g, keys)
