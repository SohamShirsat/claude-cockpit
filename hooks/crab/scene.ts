// The crab game as a vector scene: the crab, its bugs and clouds, the ground. Used where the
// surface draws SVG (the desktop), since a proportional font cannot lay block characters out as
// pixels. One unit is one art pixel of the full-size crab. Pure: games in, markup out.
//
// Smooth motion: the picture is not redrawn every step. A run is *played ahead* by the game's own
// rules (`ahead` in game.ts) for a few seconds, and the markup carries that whole stretch as
// SMIL animation: every moving thing travels its path between the steps, on the display's own
// clock, so a late or uneven redraw cannot make it stutter. A new picture is drawn only when
// something changes the plan (a key press, a cloud grabbed, the stretch running out), and it
// carries on from the same moment, because every animation starts part-way in (`begin` < 0).

import type { CostumeId, Game, Kind } from '../../types'
import { POP_LIFE } from './game'
import type { Config } from './game'
import { layers, paintOrder } from './master'
import type { Layers, Rect } from './master'

export const SCENE = { h: 72, ground: 64, feet: 26 } as const

/** What the picture needs besides the game: the ticks the plan is cut into, and how far into the first one it starts. */
export type Plan = {
  /** the game now (index 0) and each step after it: a stretch of the run, by `ahead` */
  states: Game[]
  /** how far into a step the picture starts, 0 to 1: the plan's first state is that far in the past */
  phase: number
  /** ticks since the run ended, when it has: a crab already belly up carries on from where the fall had got to */
  overAge?: number
}

type Tf = { t?: string; o?: number }

/** A position to a tenth of a unit: moves smoothly, and the markup stays short. */
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

type Pv = { type: 'translate' | 'rotate' | 'skewY' | 'scale'; v: string }
type Prop = { wrap?: string; move?: (t: number) => Pv; fade?: (t: number) => number }

// Each costume's prop moves on a few frames of the run's tick, as the full-size animation does in
// CSS (which an image redrawn every frame would restart, so the motion is spelled out here).
const PROPS: Partial<Record<CostumeId, Record<string, Prop>>> = {
  astronaut: {
    ant: { fade: t => (Math.floor(t / 5) % 2 ? 0.15 : 1) },
    star: { fade: t => (Math.floor(t / 5) % 2 ? 1 : 0.15) },
  },
  detective: {
    it: { move: t => ({ type: 'translate', v: (['0 0', '-1 1', '-2 2', '-1 1'] as const)[Math.floor(t / 3) % 4] ?? '0 0' }) },
    gl: { fade: t => (Math.floor(t / 7) % 2 ? 0.2 : 1) },
  },
  engineer: { it: { move: t => ({ type: 'rotate', v: `${Math.floor(t / 3) % 2 ? -35 : 0} 4 14` }) } },
  chef: {
    pan: { move: t => ({ type: 'rotate', v: `${(Math.floor(t / 3) % 4) % 3 ? -12 : 0} 22 9` }) },
    egg: { move: t => ({ type: 'translate', v: `0 ${(Math.floor(t / 3) % 4) % 3 ? -5 : 0}` }) },
  },
  racer: { flag: { wrap: 'translate(26 2)', move: t => ({ type: 'skewY', v: t % 2 ? '-12' : '0' }) } },
  pirate: { it: { move: t => ({ type: 'rotate', v: `${Math.floor(t / 3) % 2 ? 25 : 0} 27.5 15` }) } },
}

/** Rects as one path a color: a drawing is a few strokes, not a rect each, and the markup stays small. */
const rects = (list: readonly Rect[]): string => {
  const by = new Map<string, string>()
  for (const [x, y, w, h, c] of list) by.set(c, `${by.get(c) ?? ''}M${x} ${y}h${w}v${h}h-${w}z`)

  return [...by].map(([c, d]) => `<path d="${d}" fill="${c}"/>`).join('')
}

/** The highest pixel of a costume: where a belly-up crab meets the ground. */
export const topOf = (id: CostumeId): number =>
  Math.min(...Object.values(layers(id)).flatMap(rs => rs.map(r => r[1])))

const attrs = (tf: Tf | undefined) =>
  `${tf?.t ? ` transform="${tf.t}"` : ''}${tf?.o !== undefined && tf.o !== 1 ? ` opacity="${tf.o}"` : ''}`

/** One still crab frame at the origin of its 30 x 28 box: legs step, the body bobs, the prop moves. */
export const crabGroup = (id: CostumeId, tick: number, air: boolean, running: boolean): string => {
  const l: Layers = layers(id)
  const float = id === 'astronaut'
  const racing = id === 'racer'
  const s = running && !float ? (Math.floor(racing ? tick : tick / 2) % 2) : 0
  const legA = air ? -2 : s ? -1 : 0
  const legB = air ? -2 : s ? 0 : -1
  const bob = running && !air && !float && s ? 1 : 0
  const fy = float && running && Math.floor(tick / 5) % 2 ? -2 : 0
  const body = paintOrder(l)
    .filter(k => k !== 'la' && k !== 'lb')
    .map(k => {
      const p = PROPS[id]?.[k]
      const tf: Tf = {}
      if (p?.fade) tf.o = p.fade(tick)
      if (p?.move) {
        const m = p.move(tick)
        tf.t = `${p.wrap ? `${p.wrap} ` : ''}${m.type}(${m.v})${p.wrap ? ' translate(-26 -2)' : ''}`
      }

      return k === 'bd' ? rects(l.bd ?? []) : `<g${attrs(tf)}>${rects(l[k] ?? [])}</g>`
    })
    .join('')

  return `<g transform="translate(0 ${fy})"><g transform="translate(0 ${bob})">${body}</g><g transform="translate(0 ${legA})">${rects(l.la ?? [])}</g><g transform="translate(0 ${legB})">${rects(l.lb ?? [])}</g></g>`
}

// Pixel art, one letter a color. One path per color (a run of pixels is one stroke) keeps a frame small.
const stamp = (x: number, y: number, rows: string[], map: Record<string, string>): string => {
  const paths: Record<string, string> = {}
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; ) {
      const ch = row[dx] ?? '.'
      let len = 1
      while (row[dx + len] === ch) len++
      if (map[ch]) paths[ch] = `${paths[ch] ?? ''}M${x + dx} ${y + dy}h${len}v1h-${len}z`
      dx += len
    }
  })

  return Object.entries(paths)
    .map(([ch, d]) => `<path d="${d}" fill="${map[ch]}"/>`)
    .join('')
}

// a ladybug, and a big green beetle: the bugs to dodge or fix
const BUG = [
  '.k........k.', '..k......k..', '...bbbbbb...', '..bhhbbbbb..', '.bbhbbkbbbb.',
  '.bbbbbkbbbb.', '.bbbbbkbbbb.', 'k.bbbbkbbb.k', '.k.k....k.k.',
]
const BUG_COLORS = { b: '#C0392B', h: '#E8786B', k: '#1F1E1D' }
const BIG = [
  '..k......k..', '...k....k...', '....gggg....', '...geggeg...', '..gggggggg..', '.gghhgggggg.', '.ggghgkgggg.',
  '.gggggkgggg.', '.gggggkgggg.', '.gggggkgggg.', 'k.ggggkggg.k', '.gggggkgggg.', '.k.k....k.k.',
]
const BIG_COLORS = { g: '#3B9C5F', h: '#6CC58A', e: '#F8F6F1', k: '#1F1E1D' }
// the moth: it flies at the crab's chest, so the crab has to duck (or jump right over it)
const MOTH_UP = [
  '.ww........ww.', 'wwww..kk..wwww', 'wwwww.pp.wwwww', '.wwwwppppwwww.', '..ww.pppp.ww..',
  '.....pkkp.....', '......pp......', '.....p..p.....', '....k....k....',
]
const MOTH_DOWN = [
  '.....k..k.....', '......pp......', '.....pppp.....', '.....pkkp.....', '.ww..pppp..ww.',
  'wwww.pppp.wwww', 'wwwww.pp.wwwww', '.wwww.pp.wwww.', '..ww......ww..',
]
const MOTH_COLORS = { w: '#CFCBF7', p: '#7F77DD', k: '#1F1E1D' }
// the cloud to grab, and the green shield orb
const CLOUD = [
  '.....wwww.......', '...wwwwwwww.....', '..wwwhhwwwwwww..', '.wwwwhwwwwwwwww.',
  'wwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwww', '.wwwwwwwwwwwwww.', '..dddddddddddd..',
]
const CLOUD_COLORS = { w: '#9CCBF2', h: '#D6EBFC', d: '#6BA8DD' }
const ORB = (() => {
  const w = 12
  const h = 11
  const check = new Set(['3,5', '4,6', '5,7', '6,6', '7,5', '8,4', '9,3'])
  const shine = new Set(['3,1', '4,1', '2,2', '2,3'])

  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const dx = (x + 0.5 - w / 2) / (w / 2)
      const dy = (y + 0.5 - h / 2) / (h / 2)
      if (dx * dx + dy * dy > 1) return '.'
      const k = `${x},${y}`
      if (check.has(k)) return 'k'
      if (shine.has(k)) return 'h'

      return y >= h - 2 ? 'd' : 'g'
    }).join(''),
  )
})()
const ORB_COLORS = { g: '#4CB878', h: '#B6F0CC', d: '#2E8A55', k: '#F8F6F1' }

const CSS = `.gl{fill:#d4d3cf}.dash{fill:#c2c1bc}.cl{fill:#e6e5e1}.hl{fill:#ebeae6}.st{fill:#b9b8b3}.tx{fill:#6b4a00;font:700 7px ui-monospace,Menlo,monospace}.nt{fill:#85837d;font:600 7.5px ui-monospace,Menlo,monospace}.pf{fill:#c8c6c0}.hd{fill:#85837d;font:600 8px ui-monospace,Menlo,monospace;text-anchor:middle}.hs{fill:#4a4843}.hi{text-anchor:end}
@media (prefers-color-scheme: dark){.gl{fill:#3a3a38}.dash{fill:#4a4a47}.cl{fill:#2c2c2b}.hl{fill:#262625}.st{fill:#6a6a66}.tx{fill:#ffd76a}.nt{fill:#a9a79f}.pf{fill:#55554f}.hd{fill:#a9a79f}.hs{fill:#e4e2db}}`

const hash = (n: number) => (Math.imul(n + 1, 2654435761) >>> 0) / 4294967296

// ---- time: everything below is a track over the plan's ticks -------------------------------------

type Clock = { n: number; ms: number; phase: number }

const sec = (ms: number) => `${r2(ms / 1000)}s`
const begin = (c: Clock, atTick = 0) => sec((atTick - c.phase) * c.ms)

/** The largest of these that divides `n`: how many ticks apart the samples of a slow track can be. */
const strideOf = (n: number, wanted: number) => {
  for (let s = wanted; s > 1; s--) if (n % s === 0) return s

  return 1
}

/** A track moving smoothly: a value per tick, sampled every `stride` ticks and joined by straight lines. */
const lin = (c: Clock, type: 'translate' | 'scale' | 'rotate', vals: string[], stride: number): string => {
  if (c.n < 1 || vals.every(v => v === vals[0])) return ''
  const s = strideOf(c.n, stride)
  const picked = vals.filter((_, i) => i % s === 0)

  return `<animateTransform attributeName="transform" type="${type}" values="${picked.join(';')}" dur="${sec(c.n * c.ms)}" begin="${begin(c)}" fill="freeze"/>`
}

/** A track that steps: the value of each tick, held for the tick (the plan's last state has no tick of its own). */
const stepper = (c: Clock, attr: string, vals: string[], type?: 'translate' | 'scale' | 'rotate' | 'skewY'): string => {
  const held = vals.slice(0, c.n)
  if (c.n < 1 || held.every(v => v === held[0])) return ''
  // runs of equal values are one value: the times are spelled out only when they have to be
  const runs: { v: string; at: number }[] = []
  held.forEach((v, i) => {
    if (runs[runs.length - 1]?.v !== v) runs.push({ v, at: i })
  })
  const tag = type ? `animateTransform attributeName="transform" type="${type}"` : `animate attributeName="${attr}"`

  return `<${tag} values="${runs.map(r => r.v).join(';')}" keyTimes="${runs.map(r => r4(r.at / c.n)).join(';')}" calcMode="discrete" dur="${sec(c.n * c.ms)}" begin="${begin(c)}" fill="freeze"/>`
}

const r4 = (n: number) => Math.round(n * 10000) / 10000

/** Visible between two ticks, hidden before and after: a thing that comes in, or is taken out, mid-plan. */
const showing = (c: Clock, present: boolean[]): { attr: string; anim: string; none: boolean } => {
  const first = present.indexOf(true)
  const last = present.lastIndexOf(true)
  if (first < 0) return { attr: ' visibility="hidden"', anim: '', none: true }
  if (first === 0 && last === present.length - 1) return { attr: '', anim: '', none: false }
  const end = last + 1
  const vals = [first > 0 ? 'hidden' : '', 'visible', end < c.n ? 'hidden' : ''].filter(Boolean)
  const times = [first > 0 ? 0 : -1, first > 0 ? first / c.n : 0, end < c.n ? end / c.n : -1].filter(t => t >= 0)

  return {
    attr: first > 0 ? ' visibility="hidden"' : '',
    anim: `<animate attributeName="visibility" values="${vals.join(';')}" keyTimes="${times.map(r4).join(';')}" calcMode="discrete" dur="${sec(c.n * c.ms)}" begin="${begin(c)}" fill="freeze"/>`,
    none: false,
  }
}

// ---- the world ---------------------------------------------------------------------------------

type Pt = { x: number; y: number }

/** Far things scroll slower than the ground: a layer that moves `1/k` as far, over the world range it will cross. */
const parallax = (c: Clock, states: Game[], k: number, inner: (from: number, to: number) => string): string => {
  const offs = states.map(g => g.off / k)
  const lo = Math.min(...offs)
  const hi = Math.max(...offs)
  const vals = offs.map(o => `${r1(-o)} 0`)
  const first = vals[0] ?? '0 0'

  return `<g transform="translate(${first})">${lin(c, 'translate', vals, 6)}${inner(lo - 30, hi + 30)}</g>`
}

const sky = (c: Clock, states: Game[], w: number, ground: number): string => {
  const parts: string[] = []
  // far hills, slow
  parts.push(
    parallax(c, states, 5, (lo, hi) => {
      const pts: Pt[] = []
      for (let x = Math.floor(lo / 12) * 12; x <= hi + w + 24; x += 12) {
        pts.push({ x, y: ground - 6 - 5 * (1 + Math.sin(x / 31)) - 3 * (1 + Math.sin(x / 13 + 1)) })
      }
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x)} ${r1(p.y)}`).join('')
      const a = pts[0]?.x ?? 0
      const b = pts[pts.length - 1]?.x ?? 0

      return `<path class="hl" d="${d}L${r1(b)} ${ground}L${r1(a)} ${ground}z"/>`
    }),
  )
  // stars, up high; they twinkle on three clocks
  parts.push(
    parallax(c, states, 11, (lo, hi) => {
      const groups: string[] = ['', '', '']
      for (let i = Math.floor(lo / 17); i * 17 <= hi + w + 20; i++) {
        const h = hash(i * 7 + 3)
        if (h < 0.45) continue
        const k = ((i % 3) + 3) % 3
        const size = h > 0.85 ? 2 : 1
        groups[k] += `M${r1(i * 17 + h * 9)} ${Math.round(3 + hash(i + 91) * 26)}h${size}v${size}h-${size}z`
      }

      return groups
        .map((d, k) => `<path class="st" d="${d}"><animate attributeName="opacity" values="1;.25;1" dur="${r2(2.2 + k * 0.7)}s" begin="-${r2(k * 0.9)}s" repeatCount="indefinite"/></path>`)
        .join('')
    }),
  )
  // far clouds, a little faster than the hills
  parts.push(
    parallax(c, states, 6, (lo, hi) => {
      let d = ''
      for (let i = Math.floor(lo / 130); i * 130 <= hi + w + 40; i++) {
        const h = hash(i * 13 + 5)
        const x = r1(i * 130 + h * 50)
        const y = 8 + Math.floor(hash(i + 17) * 14)
        const len = 12 + Math.floor(h * 10)
        d += `M${x} ${y}h${len}v3h-${len}zM${r1(x + 3)} ${y - 2}h${len - 6}v2h-${len - 6}z`
      }

      return `<path class="cl" d="${d}"/>`
    }),
  )

  return parts.join('')
}

const groundLayer = (c: Clock, states: Game[], w: number, ground: number): string => {
  const line = `<rect class="gl" x="0" y="${ground}" width="${w}" height="1"/>`
  const dashes = parallax(c, states, 1, (lo, hi) => {
    let d = ''
    for (let i = Math.floor(lo / 28); i * 28 <= hi + w + 28; i++) {
      d += `M${i * 28 + 6} ${ground + 3 + (((i % 2) + 2) % 2) * 2}h${6 - (((i % 3) + 3) % 3)}v1h-${6 - (((i % 3) + 3) % 3)}z`
    }

    return `<path class="dash" d="${d}"/>`
  })

  return line + dashes
}

// ---- things that come and go ---------------------------------------------------------------------

type Track<T> = { id: number; first: number; last: number; at: (T | undefined)[] }

/** Follow things with an `id` through the plan: when each is there, and what it was at each tick. */
const follow = <T extends { id: number }>(states: Game[], list: (g: Game) => T[]): Track<T>[] => {
  const by = new Map<number, Track<T>>()
  states.forEach((g, j) => {
    for (const t of list(g)) {
      let tr = by.get(t.id)
      if (!tr) {
        tr = { id: t.id, first: j, last: j, at: Array<T | undefined>(states.length).fill(undefined) }
        by.set(t.id, tr)
      }
      tr.last = j
      tr.at[j] = t
    }
  })

  return [...by.values()]
}

/** The things in `tracks`, each drawn by `draw` and moved along its `x`; `y` is where its top sits. */
const movers = <T extends { id: number; x: number }>(
  c: Clock,
  tracks: Track<T>[],
  y: (t: T) => number,
  draw: (t: T) => string,
): string =>
  tracks
    .map(tr => {
      const present = tr.at.map(t => t !== undefined)
      const show = showing(c, present)
      if (show.none) return ''
      const xs = tr.at.map((t, j) => {
        const near = t ?? tr.at[j < tr.first ? tr.first : tr.last]

        return near ? near.x : 0
      })
      const t0 = tr.at[tr.first]
      if (!t0) return ''
      const vals = xs.map(x => `${r1(x)} ${r1(y(t0))}`)

      return `<g transform="translate(${vals[0]})"${show.attr}>${show.anim}${lin(c, 'translate', vals, 2)}${draw(t0)}</g>`
    })
    .join('')

const flap = (c: Clock) => {
  const dur = r2(c.ms * 6 / 1000)
  const a = (v: string) => `<animate attributeName="visibility" values="${v}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>`

  return { up: a('visible;hidden'), down: a('hidden;visible') }
}

const pitArt = (w: number, ground: number): string =>
  `<rect x="0" y="${ground - 1}" width="${w}" height="8" fill="#1F1E1D"/><rect x="0" y="${ground - 1}" width="1" height="8" fill="#55514C"/><rect x="${w - 1}" y="${ground - 1}" width="1" height="8" fill="#55514C"/><rect x="3" y="${ground + 2}" width="${Math.max(2, w - 6)}" height="1" fill="#C0392B" opacity=".6"/><rect x="5" y="${ground + 4}" width="${Math.max(2, w - 10)}" height="1" fill="#C0392B" opacity=".35"/>`

const bugArt = (kind: Kind, w: number, c: Clock, ground: number): string => {
  if (kind === 'beetle') return stamp(0, 0, BIG, BIG_COLORS)
  if (kind === 'twin') return `${stamp(0, 0, BUG, BUG_COLORS)}<g transform="translate(${w - 12} 0)">${stamp(0, 0, BUG, BUG_COLORS)}</g>`
  if (kind === 'pit') return pitArt(w, ground)
  if (kind === 'moth') {
    const f = flap(c)

    return `<g transform="translate(0 0)"><animateTransform attributeName="transform" type="translate" values="0 -1;0 1;0 -1" dur="0.7s" repeatCount="indefinite"/><g>${f.up}${stamp(0, 0, MOTH_UP, MOTH_COLORS)}</g><g visibility="hidden">${f.down}${stamp(0, 0, MOTH_DOWN, MOTH_COLORS)}</g></g>`
  }

  return stamp(0, 0, BUG, BUG_COLORS)
}

const BURST = {
  spark: { color: '#F5C542', n: 8, from: 2, to: 15, size: 2, lift: 0 },
  poof: { color: '#C8C6C0', n: 6, from: 1, to: 9, size: 3, lift: 0.5 },
} as const

const bursts = (c: Clock, states: Game[], ground: number): string =>
  follow(states, g => g.pops)
    .map(tr => {
      const p = tr.at[tr.first]
      if (!p) return ''
      const born = tr.first - p.age
      const life = POP_LIFE[p.kind]
      const t = (ticks: number) => begin(c, born + ticks)
      const dur = sec(life * c.ms)
      const live = `<set attributeName="visibility" to="visible" begin="${t(0)}"/><set attributeName="visibility" to="hidden" begin="${t(life)}"/>`
      const fade = (keys: string) => `<animate attributeName="opacity" values="1;1;0" keyTimes="${keys}" dur="${dur}" begin="${t(0)}" fill="freeze"/>`
      if (p.kind === 'text') {
        const y = r1(ground - p.h - 4)

        return `<g visibility="hidden" transform="translate(${r1(p.x)} ${y})">${live}<animateTransform attributeName="transform" type="translate" values="${r1(p.x)} ${y};${r1(p.x)} ${y - 12}" dur="${dur}" begin="${t(0)}" fill="freeze"/><text class="tx" x="0" y="0">${fade('0;.6;1')}${p.text ?? ''}</text></g>`
      }
      const b = BURST[p.kind]
      const dots = Array.from({ length: b.n }, (_, i) => {
        const a = (i / b.n) * Math.PI * 2 + (p.kind === 'poof' ? 0.4 : 0)
        const dx = Math.cos(a)
        const dy = Math.sin(a) - b.lift
        const at = (d: number) => `${r1(dx * d)} ${r1(dy * d)}`

        return `<g transform="translate(${at(b.from)})"><animateTransform attributeName="transform" type="translate" values="${at(b.from)};${at(b.to)}" dur="${dur}" begin="${t(0)}" fill="freeze"/><rect x="${-b.size / 2}" y="${-b.size / 2}" width="${b.size}" height="${b.size}"/></g>`
      }).join('')

      return `<g visibility="hidden" transform="translate(${r1(p.x)} ${r1(ground - p.h - 4)})" fill="${b.color}">${live}${fade('0;.55;1')}${dots}</g>`
    })
    .join('')

// ---- the crab -------------------------------------------------------------------------------------

const crabLive = (c: Clock, states: Game[], cfg: Config, ground: number): string => {
  const g0 = states[0]
  if (!g0) return ''
  const id = g0.costume
  const l: Layers = layers(id)
  const float = id === 'astronaut'
  const racing = id === 'racer'
  const running = states.map(g => g.mode === 'play')
  const air = states.map(g => g.y > 0)
  const stepAt = (g: Game, j: number) => (running[j] && !float ? Math.floor(racing ? g.tick : g.tick / 2) % 2 : 0)
  const num = (f: (g: Game, j: number) => number) => states.map((g, j) => String(f(g, j)))
  const legA = num((g, j) => (air[j] ? -2 : stepAt(g, j) ? -1 : 0)).map(v => `0 ${v}`)
  const legB = num((g, j) => (air[j] ? -2 : stepAt(g, j) ? 0 : -1)).map(v => `0 ${v}`)
  const bob = num((g, j) => (running[j] && !air[j] && !float && stepAt(g, j) ? 1 : 0)).map(v => `0 ${v}`)
  const fy = num((g, j) => (float && running[j] && Math.floor(g.tick / 5) % 2 ? -2 : 0)).map(v => `0 ${v}`)

  const body = paintOrder(l)
    .filter(k => k !== 'la' && k !== 'lb')
    .map(k => {
      if (k === 'bd') return rects(l.bd ?? [])
      const p = PROPS[id]?.[k]
      const inner = rects(l[k] ?? [])
      if (!p) return `<g>${inner}</g>`
      const ticks = states.map(g => g.tick)
      if (p.fade) {
        const o = ticks.map(t => String(p.fade?.(t) ?? 1))

        return `<g opacity="${o[0]}">${stepper(c, 'opacity', o)}${inner}</g>`
      }
      const mv = ticks.map(t => p.move?.(t) ?? { type: 'translate' as const, v: '0 0' })
      const type = mv[0]?.type ?? 'translate'
      const vals = mv.map(m => m.v)
      const core = p.wrap ? '<g transform="translate(-26 -2)">' + inner + '</g>' : inner
      const mid = `<g transform="${type}(${vals[0]})">${stepper(c, 'transform', vals, type)}${core}</g>`

      return p.wrap ? `<g transform="${p.wrap}">${mid}</g>` : mid
    })
    .join('')

  const duckScale = states.map(g => (g.duck > 0 && g.jump < 0 && g.mode === 'play' ? '1.1 .5' : '1 1'))
  const lift = states.map(g => `${cfg.crabX} ${r1(ground - SCENE.feet - g.y)}`)
  const crab = `<g transform="translate(${fy[0]})">${stepper(c, 'transform', fy, 'translate')}<g transform="translate(${bob[0]})">${stepper(c, 'transform', bob, 'translate')}${body}</g><g transform="translate(${legA[0]})">${stepper(c, 'transform', legA, 'translate')}${rects(l.la ?? [])}</g><g transform="translate(${legB[0]})">${stepper(c, 'transform', legB, 'translate')}${rects(l.lb ?? [])}</g></g>`
  const squash = `<g transform="translate(15 ${SCENE.feet})"><g transform="scale(${duckScale[0]})">${stepper(c, 'transform', duckScale, 'scale')}<g transform="translate(-15 -${SCENE.feet})">${crab}</g></g></g>`

  // the shield: a soft bubble, blinking while the grace after it is spent runs out
  const shielded = states.map(g => g.shield)
  const bubble = shielded.some(Boolean)
    ? (() => {
        const s = showing(c, shielded)

        return `<g${s.attr}>${s.anim}<ellipse cx="15" cy="15" rx="19" ry="18" fill="#6CC58A" fill-opacity=".16" stroke="#3B9C5F" stroke-width="1"/><ellipse cx="9" cy="7" rx="4" ry="2" fill="#fff" fill-opacity=".35"/></g>`
      })()
    : ''
  const blink = states.map(g => (g.inv > 0 && Math.floor(g.inv / 3) % 2 ? '.3' : '1'))
  const alive = states.map(g => g.mode !== 'over')
  const show = showing(c, alive)
  if (show.none) return ''

  return `<g transform="translate(${lift[0]})"${show.attr}>${show.anim}${lin(c, 'translate', lift, 1)}<g opacity="${blink[0]}">${stepper(c, 'opacity', blink)}${bubble}${squash}</g></g>`
}

/** The crab that lost: it flips over and drops to the ground, or down a pit. */
const crabLost = (c: Clock, states: Game[], cfg: Config, overAge: number | undefined, ground: number): string => {
  const d = states.findIndex(g => g.mode === 'over')
  const g = states[d]
  if (!g) return ''
  const pit = g.cause === 'pit'
  const startY = r1(ground - SCENE.feet - g.y)
  const endY = r1(pit ? ground + 34 : ground - 36 + topOf(g.costume))
  const fall = pit ? 12 : 6
  // a run already over carries on from how long ago it ended
  const t0 = begin(c, d === 0 ? -(overAge ?? 99) : d)
  const dur = sec(fall * c.ms)
  const x = cfg.crabX
  const reveal = d === 0 ? '' : `<set attributeName="visibility" to="visible" begin="${begin(c, d)}"/>`

  return `<g${d === 0 ? '' : ' visibility="hidden"'}>${reveal}<g transform="translate(${x} ${startY})"${pit ? '' : ' opacity=".6"'}><animateTransform attributeName="transform" type="translate" values="${x} ${startY};${x} ${endY}" calcMode="spline" keyTimes="0;1" keySplines=".4 0 1 1" dur="${dur}" begin="${t0}" fill="freeze"/><g><animateTransform attributeName="transform" type="rotate" values="0 15 18;180 15 18" dur="${dur}" begin="${t0}" fill="freeze"/>${crabGroup(g.costume, 0, false, false)}</g></g></g>`
}

// ---- the scoreboard ------------------------------------------------------------------------------
// The score, the clouds and the bugs fixed are drawn into the picture and counted by the picture, so
// the band never has to be redrawn to keep them current (a redraw can restart the animation).

const HUD_STEP = 5.4

const digits = (n: number, len: number) => String(Math.max(0, Math.min(10 ** len - 1, Math.floor(n)))).padStart(len, '0')

/** A number that counts: each place has its ten digits stacked, and each shows while it is the digit. */
const counter = (c: Clock, vals: number[], len: number, x: number, y: number, cls: string): string => {
  const strs = vals.map(v => digits(v, len))
  let out = ''
  for (let k = 0; k < len; k++) {
    const col = strs.map(t => t[k] ?? '0')
    const shown = [...new Set(col.slice(0, Math.max(1, c.n)))]
    const cx = r1(x + k * HUD_STEP)
    for (const d of shown) {
      if (shown.length === 1) {
        out += `<text class="${cls}" x="${cx}" y="${y}">${d}</text>`
        continue
      }
      const vis = col.map(v => (v === d ? 'visible' : 'hidden'))
      out += `<text class="${cls}" x="${cx}" y="${y}"${vis[0] === 'hidden' ? ' visibility="hidden"' : ''}>${stepper(c, 'visibility', vis)}${d}</text>`
    }
  }

  return out
}

const CLOUD_ICON = ['..ww..', '.wwww.', 'wwwwww', '.dddd.']
const CHECK_ICON = [[0, 2], [1, 3], [2, 2], [3, 1], [4, 0]] as const

const hud = (c: Clock, states: Game[], w: number): string => {
  const g0 = states[0]
  if (!g0) return ''
  const right = w - 6
  const hi = `<text class="hd hi" x="${right}" y="9">HI ${digits(g0.best, 4)}</text>`
  const scoreX = right - 7 * 4.9 - 8 - 4 * HUD_STEP + HUD_STEP / 2
  const score = counter(c, states.map(g => g.score), 4, scoreX, 9, 'hd hs')
  const clouds = `<g transform="translate(6 3)">${stamp(0, 0, CLOUD_ICON, CLOUD_COLORS)}</g>${counter(c, states.map(g => g.grabbed), 2, 16, 9, 'hd')}`
  const check = CHECK_ICON.map(([x, y]) => `<rect x="${34 + x}" y="${3 + y}" width="1" height="1" fill="#3B9C5F"/>`).join('')

  return hi + score + clouds + check + counter(c, states.map(g => g.fixed), 2, 46, 9, 'hd')
}

// ---- the whole scene -----------------------------------------------------------------------------

const note = (c: Clock, states: Game[], w: number): string => {
  const runs: { text: string; first: number; last: number }[] = []
  states.forEach((g, j) => {
    const last = runs[runs.length - 1]
    if (g.note && last && last.text === g.note && last.last === j - 1) last.last = j
    else if (g.note) runs.push({ text: g.note, first: j, last: j })
  })

  return runs
    .map(r => {
      const present = states.map((_, j) => j >= r.first && j <= r.last)
      const s = showing(c, present)

      return `<text class="nt" x="${w / 2}" y="20" text-anchor="middle"${s.attr}>${s.anim}${r.text}</text>`
    })
    .join('')
}

/**
 * The scene for a stretch of play: where the first state is "now minus `phase` ticks", and the
 * rest are the steps after it. The picture is correct at its first moment and carries on from there
 * on the display's own clock; with one state alone it is a still.
 */
export const motionSvg = (plan: Plan, cfg: Config, size: { width: number; height: number }): string => {
  const { states, phase, overAge } = plan
  const { h, ground } = SCENE
  const w = cfg.width
  const c: Clock = { n: Math.max(0, states.length - 1), ms: cfg.tickMs, phase }

  const parts: string[] = [sky(c, states, w, ground), groundLayer(c, states, w, ground)]
  parts.push(movers(c, follow(states, g => g.clouds), x => ground - x.h - (x.shield ? ORB.length : CLOUD.length), x => (x.shield ? stamp(0, 0, ORB, ORB_COLORS) : stamp(0, 0, CLOUD, CLOUD_COLORS))))
  parts.push(movers(c, follow(states, g => g.obs), o => (o.kind === 'pit' ? 0 : ground - o.base - o.h), o => bugArt(o.kind, o.w, c, ground)))
  parts.push(bursts(c, states, ground))
  parts.push(crabLive(c, states, cfg, ground))
  parts.push(crabLost(c, states, cfg, overAge, ground))
  parts.push(note(c, states, w))
  parts.push(hud(c, states, w))

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><style>${CSS}</style>${parts.join('')}</svg>`
}

/** One frame of a game: a still. */
export const sceneSvg = (g: Game, cfg: Config, size: { width: number; height: number }): string =>
  motionSvg({ states: [g], phase: 0 }, cfg, size)

