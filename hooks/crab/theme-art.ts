// The scenery of each theme, as pure drawers: world range in, SVG markup out. Used by themes.ts.
//
// A drawer is given `lo`..`hi`, the stretch of the layer's own world that a picture will pass over, and
// the field's width `w`, and draws what falls in `lo`..`hi + w`. All of it hangs off a fixed grid
// (`each`), never off `lo`, so the same hill or lamp post is at the same place in every picture: a new
// picture made part-way through a run carries on from the last without anything jumping.
//
// Ambient motion (rain, steam, gulls, sparks, a meteor) is `fx`: an animation that loops by itself on
// the display's clock, so it costs the same however long the picture lasts and needs no redraw.

import { box, disc, fill, hash, r1, r2 } from './pix'

export type Drawer = (lo: number, hi: number, w: number, ground: number) => string

/** Calls `fn(i, x)` for each cell of a grid `period` wide that falls in `lo`..`hi + w`; `x` is the cell's left edge. */
const each = (lo: number, hi: number, w: number, period: number, fn: (i: number, x: number) => string): string => {
  let out = ''
  for (let i = Math.floor(lo / period); i * period <= hi + w; i++) out += fn(i, i * period)

  return out
}

/** A rolling edge: a band from the points down to `bottom`, the top edge being `edge(x)`; `paint` is its attributes (a fill or a class). */
const ridge = (lo: number, hi: number, w: number, step: number, edge: (x: number) => number, bottom: number, paint: string): string => {
  const pts: string[] = []
  let first = 0
  let last = 0
  for (let x = Math.floor(lo / step) * step; x <= hi + w + step * 2; x += step) {
    pts.push(`${pts.length ? 'L' : 'M'}${r1(x)} ${r1(edge(x))}`)
    if (pts.length === 1) first = x
    last = x
  }

  return `<path d="${pts.join('')}L${r1(last)} ${bottom}L${r1(first)} ${bottom}z" ${paint}/>`
}

const solid = (color: string) => `fill="${color}"`

/** The streams of a kind of color: boxes sorted by color into one path each. */
const byColor = (): { add: (color: string, d: string) => void; out: () => string } => {
  const m = new Map<string, string>()

  return {
    add: (color, d) => m.set(color, (m.get(color) ?? '') + d),
    out: () => [...m].map(([c, d]) => fill(c, d)).join(''),
  }
}

/**
 * Scenery that repeats: `cell(i, x)` draws cell `i` of `cells`, each `period` wide, once, as a pattern tile,
 * and a rectangle of it covers the stretch in view. It costs the same however far the picture scrolls,
 * which a drawing of every cell in the stretch does not. Cells must stay inside their own width (a tile
 * clips), and anything that animates is drawn outside the tile.
 */
const tiled = (id: string, period: number, cells: number, cell: (i: number, x: number, g: number) => string): Drawer => (lo, hi, w, g) => {
  const width = period * cells
  let inner = ''
  for (let i = 0; i < cells; i++) inner += cell(i, i * period, g)

  return `<defs><pattern id="${id}" width="${width}" height="72" patternUnits="userSpaceOnUse">${inner}</pattern></defs><rect x="${Math.floor(lo) - 4}" y="0" width="${Math.ceil(hi - lo + w) + 80}" height="72" fill="url(#${id})"/>`
}

/** The cell a cell of the world is in a tile of `cells`: so a thing drawn outside the tile (a wisp of steam) lines up with the one inside. */
const slot = (period: number, cells: number, x: number): number => ((Math.floor(x / period) % cells) + cells) % cells

// ---- the meadow: the calm look the game always had ------------------------------------------------------

export const meadowHills: Drawer = (lo, hi, w, g) =>
  ridge(lo, hi, w, 12, x => g - 6 - 5 * (1 + Math.sin(x / 31)) - 3 * (1 + Math.sin(x / 13 + 1)), g, 'class="hl"')

export const meadowStars: Drawer = (lo, hi, w) => {
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
}

export const meadowClouds: Drawer = (lo, hi, w) => {
  let d = ''
  for (let i = Math.floor(lo / 130); i * 130 <= hi + w + 40; i++) {
    const h = hash(i * 13 + 5)
    const x = r1(i * 130 + h * 50)
    const y = 8 + Math.floor(hash(i + 17) * 14)
    const len = 12 + Math.floor(h * 10)
    d += `M${x} ${y}h${len}v3h-${len}zM${r1(x + 3)} ${y - 2}h${len - 6}v2h-${len - 6}z`
  }

  return `<path class="cl" d="${d}"/>`
}

export const meadowFloor: Drawer = (lo, hi, w, g) => {
  let d = ''
  for (let i = Math.floor(lo / 28); i * 28 <= hi + w + 28; i++) {
    d += `M${i * 28 + 6} ${g + 3 + (((i % 2) + 2) % 2) * 2}h${6 - (((i % 3) + 3) % 3)}v1h-${6 - (((i % 3) + 3) % 3)}z`
  }

  return `<path class="dash" d="${d}"/>`
}

// ---- the beach --------------------------------------------------------------------------------------------

export const beachSun: Drawer = (lo, hi, w) =>
  each(lo, hi, w, 560, (i, x0) => {
    const cx = x0 + 140 + hash(i + 5) * 200

    return fill('#FFE7A0', disc(cx, 17, 10), ' opacity=".6"') + fill('#FFC83D', disc(cx, 17, 7)) + fill('#FFE08A', disc(cx - 2, 15, 3))
  })

export const beachSea: Drawer = (lo, hi, w, g) => {
  const wave = (x: number) => g - 26 + Math.round(Math.sin(x / 11) * 1.4)

  return ridge(lo, hi, w, 8, wave, g - 12, solid('#7ED3E0')) + ridge(lo, hi, w, 8, x => wave(x) + 9, g - 12, solid('#5DB9CC'))
}

export const beachPalms: Drawer = tiled('t-beach-palms', 190, 3, (i, x0, g) => {
  const x = x0 + 30 + hash(i * 3 + 1) * 100
  const lean = hash(i + 9) > 0.5 ? 1 : -1
  const c = byColor()
  let tx = x
  for (let t = 0; t < 30; t += 2) {
    tx = x + lean * Math.round(6 * (t / 30) ** 1.6)
    c.add('#B79A74', box(tx, g - t - 2, 2, 2))
  }
  const top = g - 32
  for (const [dx, dy] of [[-10, 3], [-7, -2], [0, -5], [7, -2], [10, 3]] as const) {
    for (let s = 1; s <= 8; s++) {
      const f = s / 8
      c.add('#8CC59C', box(tx + dx * f - 1, top + dy * f + f * f * 4, 2, 2))
    }
  }
  c.add('#8A6A48', box(tx - 1, top + 2, 3, 2))

  return c.out()
})

export const beachFloor: Drawer = tiled('t-beach-floor', 31, 8, (i, x, g) =>
  fill('#DDC48C', box(x + 7, g + 3 + (i % 3), 3, 1)) + (i % 3 === 0 ? fill('#E8B7A2', box(x + 12, g + 5, 2, 1)) : ''),
)

const seaGlints = (w: number, g: number): string => {
  let out = ''
  for (let i = 0; i < Math.round(w / 70); i++) {
    const x = r1(hash(i * 5 + 2) * w)
    const y = g - 24 + Math.floor(hash(i * 5 + 3) * 10)
    const dur = r2(1.4 + hash(i + 40) * 1.8)
    out += `<rect class="fx" x="${x}" y="${y}" width="2" height="1" fill="#FFFFFF" opacity="0"><animate attributeName="opacity" values="0;.9;0" dur="${dur}s" begin="-${r2(hash(i + 70) * 3)}s" repeatCount="indefinite"/></rect>`
  }

  return out
}

const GULL = [[0, 1], [1, 0], [2, 1], [3, 0], [4, 1]] as const

const gulls = (w: number): string =>
  [0, 1]
    .map(i => {
      const y = 9 + i * 8
      const dur = 17 + i * 5
      const d = GULL.map(([x, yy]) => box(x, yy, 1, 1)).join('')

      return `<g class="fx"><animateTransform attributeName="transform" type="translate" values="${w + 12} ${y};-12 ${y + 2}" dur="${dur}s" begin="-${i * 9}s" repeatCount="indefinite"/><path d="${d}" fill="#7C8896"/></g>`
    })
    .join('')

export const beachFx = (w: number, g: number): string => seaGlints(w, g) + gulls(w)

// ---- the kitchen -----------------------------------------------------------------------------------------

export const kitchenTiles: Drawer = tiled('t-kitchen-tiles', 16, 1, (_, x, g) => fill('#E9DABB', box(x, 24, 1, g - 24) + box(x, g - 14, 16, 1) + box(x, g - 30, 16, 1)))

const steam = (x: number, y: number, seed: number): string => {
  const dur = r2(2.2 + hash(seed) * 1.4)

  return `<g class="fx" transform="translate(${r1(x)} ${r1(y)})"><animateTransform attributeName="transform" type="translate" values="${r1(x)} ${r1(y)};${r1(x + 1)} ${r1(y - 9)}" dur="${dur}s" begin="-${r2(hash(seed + 1) * dur)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.85;0" dur="${dur}s" begin="-${r2(hash(seed + 1) * dur)}s" repeatCount="indefinite"/><path d="${box(0, 0, 2, 1)}${box(1, -3, 2, 1)}${box(0, -6, 2, 1)}" fill="#FFFFFF"/></g>`
}

/** What stands on the shelf in cell `i`: pots (which steam), jars and mugs, by where they stand. */
const shelfItems = (i: number): { kind: number; dx: number }[] => [0, 1, 2, 3].map(j => ({ kind: Math.floor(hash(i * 11 + j) * 3), dx: 8 + j * 23 }))

const kitchenShelvesTile: Drawer = tiled('t-kitchen-shelves', 150, 3, (i, x0, g) => {
  const x = x0 + 10
  const c = byColor()
  c.add('#E9DABA', box(x, g - 34, 100, 2))
  c.add('#D2BE98', box(x, g - 32, 100, 1) + box(x + 6, g - 31, 2, 5) + box(x + 92, g - 31, 2, 5))
  for (const { kind, dx } of shelfItems(i)) {
    const xx = x + dx
    if (kind === 0) {
      c.add('#6B7280', box(xx, g - 42, 12, 8))
      c.add('#9AA3AF', box(xx - 1, g - 43, 14, 1) + box(xx + 5, g - 45, 2, 2))
    } else if (kind === 1) {
      c.add('#C9E4DE', box(xx, g - 44, 8, 10))
      c.add('#C0392B', box(xx, g - 46, 8, 2))
    } else {
      c.add('#E5484D', box(xx, g - 39, 6, 5) + box(xx + 6, g - 38, 1, 3))
    }
  }

  return c.out()
})

export const kitchenShelves: Drawer = (lo, hi, w, g) =>
  kitchenShelvesTile(lo, hi, w, g) +
  each(lo, hi, w, 150, (n, x0) =>
    shelfItems(slot(150, 3, x0))
      .filter(({ kind }) => kind === 0)
      .slice(0, 1)
      .map(({ dx }, j) => steam(x0 + 10 + dx + 5, g - 47, n * 7 + j))
      .join(''),
  )

export const kitchenWindow: Drawer = tiled('t-kitchen-window', 380, 1, (i, x0) => {
  const x = x0 + 60 + hash(i + 2) * 200
  const c = byColor()
  c.add('#DCC9A2', box(x, 12, 30, 24) + box(x - 2, 36, 34, 2))
  c.add('#EAF5FB', box(x + 2, 14, 26, 20))
  c.add('#DCC9A2', box(x + 14, 14, 2, 20) + box(x + 2, 23, 26, 2))

  return c.out()
})

export const kitchenFloor: Drawer = tiled('t-kitchen-floor', 12, 2, (i, x, g) => fill('#C4A67B', i === 0 ? box(x, g + 1, 12, 4) : box(x, g + 5, 12, 4)))

// ---- the speedway ----------------------------------------------------------------------------------------

const CROWD = ['#9FB3C8', '#C7B8A0', '#A9B8A3', '#D6D2E4', '#B8A9B5']

export const speedwayStands: Drawer = tiled('t-speed-stands', 330, 2, (i, x0, g) => {
  const x = x0 + hash(i + 4) * 60
  const c = byColor()
  c.add('#9AA3B5', box(x, g - 40, 130, 3))
  c.add('#C4CBD8', box(x, g - 37, 130, 24))
  c.add('#A0A9BB', box(x + 3, g - 27, 124, 2) + box(x + 3, g - 19, 124, 2))
  for (const [row, y] of [[0, g - 32], [1, g - 24]] as const) {
    for (let j = 0; j < 17; j++) c.add(CROWD[Math.floor(hash(i * 40 + row * 20 + j) * CROWD.length)] ?? '#9FB3C8', box(x + 6 + j * 7, y, 3, 2))
  }

  return c.out()
})

export const speedwayBoards: Drawer = tiled('t-speed-boards', 170, 2, (i, x0, g) => {
  const x = x0 + 40 + hash(i + 8) * 70
  const c = byColor()
  c.add('#8A93A6', box(x, g - 18, 2, 18))
  c.add('#F8FAFC', box(x - 10, g - 30, 22, 12))
  c.add('#9FB3C8', box(x - 10, g - 26, 22, 4))
  c.add('#C9D3DF', box(x - 10, g - 22, 22, 2))

  return c.out()
})

export const speedwayFloor: Drawer = tiled('t-speed-floor', 176, 1, (_, x, g) => {
  const c = byColor()
  for (let i = 0; i < 11; i++) c.add(i % 2 === 0 ? '#E5484D' : '#FFFFFF', box(x + i * 16, g, 16, 3))
  for (let i = 0; i < 4; i++) c.add('#FFFFFF', box(x + i * 44 + 8, g + 6, 16, 1))

  return c.out()
})

const scroller = (w: number, dur: number, inner: string): string =>
  `<g class="fx"><animateTransform attributeName="transform" type="translate" values="0 0;-${w} 0" dur="${dur}s" repeatCount="indefinite"/>${inner}<g transform="translate(${w} 0)">${inner}</g></g>`

export const speedwayFx = (w: number, g: number): string => {
  const streak = byColor()
  for (let i = 0; i < 9; i++) streak.add('#B9C9DA', box(hash(i * 3) * w, 6 + hash(i * 3 + 1) * (g - 12), 12 + hash(i * 3 + 2) * 26, 1))

  return scroller(w, 0.7, `<g opacity=".7">${streak.out()}</g>`)
}

// ---- the building site -----------------------------------------------------------------------------------

export const siteCranes: Drawer = (lo, hi, w, g) =>
  each(lo, hi, w, 400, (i, x0) => {
    const x = x0 + 80 + hash(i + 6) * 160
    const c = byColor()
    c.add('#C8B678', box(x, g - 50, 3, 50) + box(x - 34, g - 52, 82, 3) + box(x - 34, g - 49, 9, 6) + box(x + 38, g - 49, 1, 14) + box(x + 36, g - 35, 5, 3))
    for (let y = g - 46; y < g; y += 6) c.add('#C8B678', box(x - 1, y, 5, 1))

    return c.out()
  })

export const siteFrames: Drawer = (lo, hi, w, g) =>
  tiled('t-site-frames', 300, 2, (_, x0, gg) => {
    const x = x0 + 20
    const c = byColor()
    for (const dx of [0, 60, 120]) c.add('#A9A28F', box(x + dx, gg - 36, 3, 36))
    c.add('#B5AE9B', box(x, gg - 36, 123, 2) + box(x, gg - 18, 123, 2))
    c.add('#E5B25D', box(x + 3, gg - 34, 57, 1) + box(x + 63, gg - 34, 57, 1))

    return c.out()
  })(lo, hi, w, g) +
  // the sparks fly at the same joint of every frame, and are outside the tile because they move
  each(lo, hi, w, 300, (n, x0) => {
    const x = x0 + 20
    let sparks = ''
    for (let j = 0; j < 2; j++) {
      const dur = r2(0.8 + hash(n * 5 + j) * 0.5)
      sparks += `<rect class="fx" x="${r1(x + 61)}" y="${r1(g - 38)}" width="1" height="1" fill="#FFB020" opacity="0"><animate attributeName="opacity" values="0;1;0" dur="${dur}s" begin="-${r2(j * 0.3)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${(j - 1.5) * 3} ${-4 - j * 2}" dur="${dur}s" begin="-${r2(j * 0.3)}s" repeatCount="indefinite"/></rect>`
    }

    return sparks
  })

export const siteFloor: Drawer = tiled('t-site-floor', 16, 1, (_, x, g) => {
  const c = byColor()
  c.add('#F2C230', box(x, g, 16, 3))
  c.add('#2B2B29', box(x + 8, g, 8, 1) + box(x + 9, g + 1, 7, 1) + box(x + 10, g + 2, 6, 1) + box(x, g + 1, 2, 1) + box(x, g + 2, 3, 1))
  c.add('#A39B88', box(x + 5, g + 5, 3, 1) + box(x + 12, g + 6, 2, 1))

  return c.out()
})

// ---- the rainy city --------------------------------------------------------------------------------------

export const cityFar: Drawer = (lo, hi, w, g) =>
  each(lo, hi, w, 48, (i, x0) => {
    const bw = 22 + Math.floor(hash(i * 3) * 14)
    const bh = 20 + Math.floor(hash(i * 3 + 1) * 20)
    const x = x0 + hash(i * 3 + 2) * 12
    const c = byColor()
    c.add('#27314A', box(x, g - bh - 8, bw, bh + 8))
    for (let k = 0; k < 3; k++) if (hash(i * 9 + k) > 0.6) c.add('#F2D27A', box(x + 3 + k * 8, g - bh - 3 + Math.floor(hash(i * 4 + k) * 12), 2, 2))

    return c.out()
  })

export const cityNear: Drawer = (lo, hi, w, g) =>
  each(lo, hi, w, 56, (i, x0) => {
    const bw = 30 + Math.floor(hash(i * 5) * 20)
    const bh = 18 + Math.floor(hash(i * 5 + 1) * 18)
    const x = x0 + hash(i * 5 + 2) * 14
    const c = byColor()
    c.add('#313D5A', box(x, g - bh, bw, bh))
    for (let cx = 4; cx < bw - 4; cx += 7) {
      for (let cy = 4; cy < bh - 4; cy += 7) if (hash(i * 31 + cx * 3 + cy) > 0.72) c.add('#F2C94C', box(x + cx, g - bh + cy, 3, 3))
    }

    return c.out()
  })

export const cityLamps: Drawer = (lo, hi, w, g) =>
  tiled('t-city-lamps', 160, 1, (_, x0, gg) => {
    const x = x0 + 60
    const c = byColor()
    c.add('#5A6784', box(x, gg - 30, 2, 30) + box(x - 6, gg - 31, 8, 2))
    c.add('#F6E3A1', box(x - 9, gg - 30, 5, 2))
    let glow = ''
    for (let s = 0; s < 6; s++) glow += box(x - 11 - s * 2, gg - 28 + s * 5, 9 + s * 4, 5)

    return fill('#FFE9A8', glow, ' opacity=".07"') + c.out() + fill('#F2D58A', box(x - 4, gg + 2, 10, 1) + box(x - 2, gg + 4, 6, 1) + box(x - 1, gg + 6, 3, 1), ' opacity=".3"')
  })(lo, hi, w, g)

export const cityFloor: Drawer = tiled('t-city-floor', 28, 1, (_, x, g) => fill('#2F384D', box(x, g + 4, 28, 1) + box(x, g + 5, 1, 4) + box(x + 14, g + 5, 1, 4)))

const rain = (id: string, w: number, h: number, o: { tile: number; n: number; len: number; color: string; opacity: number; dur: number; seed: number }): string => {
  let d = ''
  for (let i = 0; i < o.n; i++) {
    const x = Math.floor(hash(o.seed + i * 3) * o.tile)
    const y = Math.floor(hash(o.seed + i * 3 + 1) * h)
    d += box(x, y, 1, o.len) + box(x - 1, y + o.len, 1, o.len)
  }

  return `<defs><pattern id="${id}" width="${o.tile}" height="${h}" patternUnits="userSpaceOnUse"><path d="${d}" fill="${o.color}" opacity="${o.opacity}"/></pattern></defs><g class="fx"><animateTransform attributeName="transform" type="translate" values="0 0;0 ${h}" dur="${o.dur}s" repeatCount="indefinite"/><rect x="0" y="${-h}" width="${w}" height="${h * 2}" fill="url(#${id})"/></g>`
}

const splashes = (w: number, g: number, color: string, n: number): string => {
  let out = ''
  for (let i = 0; i < n; i++) {
    const dur = r2(0.5 + hash(i + 11) * 0.5)
    out += `<rect class="fx" x="${r1(hash(i * 7 + 1) * w)}" y="${g + 1}" width="${3 + (i % 2)}" height="1" fill="${color}" opacity="0"><animate attributeName="opacity" values="0;.8;0" dur="${dur}s" begin="-${r2(hash(i + 5) * dur)}s" repeatCount="indefinite"/></rect>`
  }

  return out
}

export const cityFx = (w: number, g: number, h: number): string =>
  rain('rain-city-a', w, h, { tile: 61, n: 8, len: 3, color: '#9DB4D9', opacity: 0.26, dur: 0.9, seed: 3 }) +
  rain('rain-city-b', w, h, { tile: 47, n: 5, len: 4, color: '#B6C9E6', opacity: 0.4, dur: 0.55, seed: 77 }) +
  splashes(w, g, '#8FA6CC', Math.round(w / 45))

// ---- the storm at sea ------------------------------------------------------------------------------------

export const stormClouds: Drawer = (lo, hi, w) =>
  each(lo, hi, w, 110, (i, x0) => {
    const x = x0 + hash(i + 2) * 30
    const bw = 60 + Math.floor(hash(i + 3) * 40)

    return fill('#161F25', box(x, 7, bw, 6) + box(x + 8, 3, bw - 18, 4) + box(x + 4, 13, bw - 10, 4))
  })

export const stormShip: Drawer = (lo, hi, w, g) =>
  each(lo, hi, w, 700, (i, x0) => {
    const x = x0 + 120 + hash(i + 1) * 260
    const y = g - 52
    const hull = byColor()
    hull.add('#0F171B', box(x, y + 28, 38, 2) + box(x + 2, y + 30, 34, 4) + box(x + 5, y + 34, 28, 2) + box(x + 9, y + 2, 1, 26) + box(x + 19, y - 4, 1, 32) + box(x + 29, y + 5, 1, 23))
    hull.add('#1E2C34', box(x + 10, y + 4, 8, 12) + box(x + 20, y - 2, 8, 14) + box(x + 30, y + 7, 6, 9) + box(x + 12, y + 16, 3, 2) + box(x + 22, y + 14, 4, 3))

    return `<g><animateTransform attributeName="transform" type="rotate" values="-2 ${r1(x + 19)} ${y + 34};2 ${r1(x + 19)} ${y + 34};-2 ${r1(x + 19)} ${y + 34}" dur="3.4s" repeatCount="indefinite"/>${hull.out()}</g>`
  })

const seaRidge = (period: number, amp: number, base: number, color: string, caps: boolean): Drawer => (lo, hi, w, g) => {
  const edge = (x: number) => g - base + Math.round(Math.sin(x / period) * amp + Math.sin(x / (period * 2.3) + 1) * amp * 0.6)
  let out = ridge(lo, hi, w, 6, edge, g - 2, solid(color))
  if (caps) {
    out += fill(
      '#D2E8EF',
      each(lo, hi, w, 38, (i, x) => (hash(i + 7) > 0.35 ? box(x + hash(i) * 20, edge(x + 10) - 1, 6, 1) : '')),
      ' opacity=".8"',
    )
  }

  return out
}

export const stormWavesFar: Drawer = seaRidge(14, 2, 26, '#1B323B', false)
export const stormWavesNear: Drawer = (lo, hi, w, g) => `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 1.5;0 0" dur="2.2s" repeatCount="indefinite"/>${seaRidge(9, 2.2, 14, '#223E49', true)(lo, hi, w, g)}</g>`

export const stormFloor: Drawer = tiled('t-storm-floor', 30, 1, (_, x, g) => fill('#5C4329', box(x, g + 1, 1, 8) + box(x, g + 5, 30, 1)) + fill('#3D2B1A', box(x + 3, g + 2, 1, 1) + box(x + 3, g + 7, 1, 1)))

export const stormFx = (w: number, g: number, h: number): string => {
  const bolt = fill('#F4FBFF', box(w * 0.62, 0, 2, 9) + box(w * 0.62 - 2, 9, 2, 9) + box(w * 0.62, 18, 2, 9) + box(w * 0.62 - 3, 27, 2, 9))
  const flash = (values: string) => `<animate attributeName="opacity" values="${values}" keyTimes="0;.82;.84;.88;.9;.94;1" dur="8s" repeatCount="indefinite"/>`

  return (
    rain('rain-storm-a', w, h, { tile: 59, n: 10, len: 3, color: '#B9D3E0', opacity: 0.3, dur: 0.7, seed: 21 }) +
    rain('rain-storm-b', w, h, { tile: 43, n: 7, len: 4, color: '#CFE4EE', opacity: 0.42, dur: 0.45, seed: 91 }) +
    `<g class="fx" opacity="0">${flash('0;0;1;0;.6;0;0')}${bolt}</g><rect class="fx" x="0" y="0" width="${w}" height="${h}" fill="#DFF1FF" opacity="0">${flash('0;0;.22;0;.12;0;0')}</rect>` +
    splashes(w, g, '#9FC0CF', Math.round(w / 55))
  )
}

// ---- the moon --------------------------------------------------------------------------------------------

export const moonStars: Drawer = (lo, hi, w) => {
  const groups: string[] = ['', '', '']
  for (let i = Math.floor(lo / 11); i * 11 <= hi + w + 20; i++) {
    const h = hash(i * 7 + 13)
    if (h < 0.4) continue
    groups[((i % 3) + 3) % 3] += box(i * 11 + h * 8, 3 + hash(i + 191) * 50, h > 0.9 ? 2 : 1, h > 0.9 ? 2 : 1)
  }

  return groups
    .map((d, k) => `<path d="${d}" fill="${k === 0 ? '#FFFFFF' : k === 1 ? '#CFE0FF' : '#FFE9B8'}"><animate attributeName="opacity" values="1;.3;1" dur="${r2(2.4 + k * 0.8)}s" begin="-${r2(k * 1.1)}s" repeatCount="indefinite"/></path>`)
    .join('')
}

export const moonEarth: Drawer = (lo, hi, w) =>
  each(lo, hi, w, 900, (i, x0) => {
    const cx = x0 + 320 + hash(i + 2) * 240
    const cy = 22
    const blobs = [[-5, -4, 4], [4, 3, 5], [-7, 6, 3]] as const

    return (
      fill('#3F7DD1', disc(cx, cy, 15)) +
      fill('#58A66E', blobs.map(([dx, dy, r]) => disc(cx + dx, cy + dy, r)).join('')) +
      fill('#EAF3FF', box(cx - 9, cy - 8, 8, 1) + box(cx + 1, cy + 7, 9, 1) + box(cx - 3, cy - 1, 6, 1)) +
      fill('#0C0F1E', disc(cx + 9, cy + 2, 8), ' opacity=".35"')
    )
  })

export const moonRidgeFar: Drawer = (lo, hi, w, g) => ridge(lo, hi, w, 10, x => g - 14 - 6 * (1 + Math.sin(x / 40)) - 2 * Math.sin(x / 11), g, solid('#1A1E3C'))
export const moonRidgeNear: Drawer = (lo, hi, w, g) => ridge(lo, hi, w, 8, x => g - 7 - 3 * (1 + Math.sin(x / 23 + 2)), g, solid('#232850'))

export const moonFloor: Drawer = tiled('t-moon-floor', 90, 2, (i, x0, g) => {
  const x = x0 + 8 + hash(i) * 40
  const c = byColor()
  c.add('#767A91', box(x, g + 3, 12, 1) + box(x + 1, g + 4, 10, 2) + box(x + 3, g + 6, 6, 1))
  c.add('#A4A7BC', box(x + 1, g + 2, 10, 1) + box(x + 60, g + 7, 2, 1))

  return c.out()
})

export const moonFx = (w: number): string =>
  `<g class="fx" opacity="0"><animate attributeName="opacity" values="0;1;0;0" keyTimes="0;.01;.08;1" dur="11s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="${r1(w * 0.12)} 4;${r1(w * 0.5)} 34;${r1(w * 0.5)} 34" keyTimes="0;.08;1" dur="11s" repeatCount="indefinite"/>${fill('#FFFFFF', box(0, 0, 3, 1) + box(-3, -1, 3, 1))}${fill('#9FB4FF', box(-7, -2, 4, 1) + box(-12, -3, 5, 1), ' opacity=".6"')}</g>`

