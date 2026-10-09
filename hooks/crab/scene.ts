// The crab game as a vector scene: the crab, its bugs and clouds, the ground. Used where the
// surface draws SVG (the desktop), since a proportional font cannot lay block characters out as
// pixels. One unit is one art pixel of the full-size crab. Pure: a Game in, markup out.

import type { CostumeId, Game } from '../../types'
import { POP_TICKS } from './game'
import type { Config } from './game'
import { GRID, layers, paintOrder } from './master'
import type { Layers, Rect } from './master'

export const SCENE = { w: 340, h: 68, ground: 60, feet: 26 } as const

type Tf = { t?: string; o?: number }

/** A position to a tenth of a unit: moves smoothly, and the markup stays short. */
const r1 = (n: number) => Math.round(n * 10) / 10

// Each costume's prop moves on a few frames of the run's tick, as the full-size animation does
// in CSS (which an image redrawn every frame would restart, so the motion is spelled out here).
const PROPS: Partial<Record<CostumeId, (t: number) => Record<string, Tf>>> = {
  astronaut: t => {
    const b = Math.floor(t / 5) % 2
    return { ant: { o: b ? 0.15 : 1 }, star: { o: b ? 1 : 0.15 } }
  },
  detective: t => {
    const [x, y] = [[0, 0], [-1, 1], [-2, 2], [-1, 1]][Math.floor(t / 3) % 4] ?? [0, 0]
    return { it: { t: `translate(${x} ${y})` }, gl: { o: Math.floor(t / 7) % 2 ? 0.2 : 1 } }
  },
  engineer: t => ({ it: { t: `rotate(${Math.floor(t / 3) % 2 ? -35 : 0} 4 14)` } }),
  chef: t => {
    const p = Math.floor(t / 3) % 4
    const up = p === 1 || p === 2
    return { pan: { t: `rotate(${up ? -12 : 0} 22 9)` }, egg: { t: `translate(0 ${up ? -5 : 0})` } }
  },
  racer: t => ({ flag: { t: t % 2 ? 'translate(26 2) skewY(-12) scale(.85 1) translate(-26 -2)' : '' } }),
  pirate: t => ({ it: { t: `rotate(${Math.floor(t / 3) % 2 ? 25 : 0} 27.5 15)` } }),
}

const rect = ([x, y, w, h, c]: Rect) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`
const attrs = (tf: Tf | undefined) =>
  `${tf?.t ? ` transform="${tf.t}"` : ''}${tf?.o !== undefined && tf.o !== 1 ? ` opacity="${tf.o}"` : ''}`

/** The highest pixel of a costume: where a belly-up crab meets the ground. */
export const topOf = (id: CostumeId): number =>
  Math.min(...Object.values(layers(id)).flatMap(rs => rs.map(r => r[1])))

/** One crab frame at the origin of its 30 x 28 box: legs step, the body bobs, the prop moves. */
export const crabGroup = (id: CostumeId, tick: number, air: boolean, running: boolean): string => {
  const l: Layers = layers(id)
  const props = PROPS[id]?.(tick) ?? {}
  const float = id === 'astronaut'
  const racing = id === 'racer'
  const s = running && !float ? (Math.floor(racing ? tick : tick / 2) % 2) : 0
  const legA = air ? -2 : s ? -1 : 0
  const legB = air ? -2 : s ? 0 : -1
  const bob = running && !air && !float && s ? 1 : 0
  const body = paintOrder(l)
    .filter(k => k !== 'la' && k !== 'lb')
    .map(k => (k === 'bd' ? (l.bd ?? []).map(rect).join('') : `<g${attrs(props[k])}>${(l[k] ?? []).map(rect).join('')}</g>`))
    .join('')
  const fy = float && running && Math.floor(tick / 5) % 2 ? -2 : 0

  return `<g transform="translate(0 ${fy})"><g transform="translate(0 ${bob})">${body}</g><g transform="translate(0 ${legA})">${(l.la ?? []).map(rect).join('')}</g><g transform="translate(0 ${legB})">${(l.lb ?? []).map(rect).join('')}</g></g>`
}

// Pixel art, one letter a color. One path per color (a run of pixels is one stroke) keeps a
// frame small: the desktop redraws it 25 times a second.
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

// a ladybug, and a big green beetle: the bugs to dodge
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
// the cloud to grab
const CLOUD = [
  '.....wwww.......', '...wwwwwwww.....', '..wwwhhwwwwwww..', '.wwwwhwwwwwwwww.',
  'wwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwww', '.wwwwwwwwwwwwww.', '..dddddddddddd..',
]
const CLOUD_COLORS = { w: '#9CCBF2', h: '#D6EBFC', d: '#6BA8DD' }

const CSS = `.gl{fill:#d4d3cf}.dash{fill:#c2c1bc}.cl{fill:#e6e5e1}
@media (prefers-color-scheme: dark){.gl{fill:#3a3a38}.dash{fill:#4a4a47}.cl{fill:#2c2c2b}}`

/** The whole scene for one frame of a game, as a standalone SVG sized to its own aspect. */
export const sceneSvg = (g: Game, cfg: Config, size: { width: number; height: number }): string => {
  const { w, h, ground, feet } = SCENE
  const dead = g.mode === 'over'
  const live = g.mode === 'play'
  const lift = g.y
  const parts: string[] = []

  // a little sky: two clouds drifting slower than the ground
  for (const [n, y, len] of [[40, 9, 14], [200, 17, 10]] as const) {
    const x = ((n - g.off / 5) % (w + 30) + w + 30) % (w + 30) - 20
    parts.push(`<g class="cl"><rect x="${x}" y="${y}" width="${len}" height="3"/><rect x="${x + 3}" y="${y - 2}" width="${len - 6}" height="2"/></g>`)
  }
  // the ground, with dashes that scroll
  parts.push(`<rect class="gl" x="0" y="${ground}" width="${w}" height="1"/>`)
  for (let i = -1; i < 14; i++) {
    const x = Math.round(i * 28 - (g.off % 28)) + 6
    parts.push(`<rect class="dash" x="${x}" y="${ground + 3 + (i % 2) * 2}" width="${6 - (i % 3)}" height="1"/>`)
  }
  // clouds to grab, up in the air; a sparkle where one was just grabbed
  for (const c of g.clouds) {
    parts.push(`<g transform="translate(${r1(c.x)} ${r1(ground - c.h - CLOUD.length)})">${stamp(0, 0, CLOUD, CLOUD_COLORS)}</g>`)
  }
  for (const p of g.pops) {
    const d = 2 + p.age * 1.6
    const cy = ground - p.h - CLOUD.length / 2
    const fill = p.age < POP_TICKS / 2 ? '#F5C542' : '#F9DE8B'
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]] as const) {
      parts.push(`<rect x="${r1(p.x + dx * d)}" y="${r1(cy + dy * d)}" width="2" height="2" fill="${fill}"/>`)
    }
  }
  // bugs: each sits on the ground
  for (const o of g.obs) {
    parts.push(
      o.tall
        ? `<g transform="translate(${r1(o.x)} ${ground - BIG.length})">${stamp(0, 0, BIG, BIG_COLORS)}</g>`
        : `<g transform="translate(${r1(o.x)} ${ground - BUG.length})">${stamp(0, 0, BUG, BUG_COLORS)}</g>`,
    )
  }
  // the crab: feet on the ground; belly up and grey once the run is lost
  const x = cfg.crabX
  if (dead) {
    const y = ground - 36 + topOf(g.costume)
    parts.push(`<g opacity=".6" transform="translate(${x} ${y}) rotate(180 15 18)">${crabGroup(g.costume, 0, false, false)}</g>`)
  } else {
    parts.push(`<g transform="translate(${x} ${ground - feet - lift})">${crabGroup(g.costume, g.tick, lift > 0, live)}</g>`)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><style>${CSS}</style>${parts.join('')}</svg>`
}
