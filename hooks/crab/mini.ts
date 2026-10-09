// The crab at game size: 9 pixels wide, drawn two pixels to a terminal cell with half blocks
// (▀ ▄), so it is plain colored text and runs anywhere the band does. Hand-set from the full-size
// sprites in master.ts: the body, the hat, and one prop that moves between two frames.
// Pure data and functions: no `$`, no timers.

import type { CostumeId } from '../../types'

/** A pixel: a color, or null for empty. */
export type Px = string | null
export type Frame = Px[][]
export type Cell = { ch: string; fg?: string; bg?: string }

export const MINI_W = 9
/** The columns of the crab that can be hit: its body, not its claws. */
export const HIT = { from: 3, to: 5 } as const
/** Pixels off the ground per tick of a jump. */
export const ARC = [1, 2, 3, 3, 3, 3, 3, 2, 1] as const

const CLAY = '#D97757'
const INK = '#1F1E1D'

const BODY = ['.ccccccc.', '.ckccckc.', 'ccccccccc', '.ccccccc.']
const LEGS = { walk: ['.c.c.c.c.', 'c.c.c.c.c'], air: '.cc...cc.' } as const

type Prop = readonly [x: number, y: number, ch: string]
type Mini = { hat: string[]; palette: Record<string, string>; props: readonly [Prop[], Prop[]] }

// Prop coordinates count from the sprite's top-left, hat included.
const MINI: Record<CostumeId, Mini> = {
  plain: { hat: [], palette: {}, props: [[], []] },
  astronaut: {
    hat: ['....t....', '.wwwwwww.'],
    palette: { t: '#7F77DD', w: '#E6E8EE', s: '#F5C542' },
    props: [[[8, 0, 's']], []],
  },
  detective: {
    hat: ['..bbcbb..', 'ddddddddd'],
    palette: { b: '#7A4A26', c: '#A0703F', d: '#5A3519', m: '#A9D6F5' },
    props: [[[8, 3, 'm']], [[8, 2, 'm']]],
  },
  engineer: {
    hat: ['..yyhyy..', 'ddddddddd'],
    palette: { y: '#F5C542', h: '#FBE08A', d: '#C99A1E', s: '#8E929A' },
    props: [[[0, 3, 's']], [[0, 2, 's']]],
  },
  chef: {
    hat: ['..wwwww..', '.bbbbbbb.'],
    palette: { w: '#F4F3EE', b: '#378ADD', e: '#F5B731' },
    props: [[[8, 2, 'e']], [[8, 0, 'e']]],
  },
  racer: {
    hat: ['..rrwrr..', '.rrrwrrr.'],
    palette: { r: '#1D9E75', w: '#F8F6F1', k: INK },
    props: [
      [[8, 0, 'w'], [8, 1, 'k']],
      [[8, 0, 'k'], [8, 1, 'w']],
    ],
  },
  pirate: {
    hat: ['..kkwkk..', '.ggggggg.'],
    palette: { k: '#55514C', w: '#F8F6F1', g: '#F5C542', i: '#C9CCD2' },
    props: [[[8, 3, 'i']], [[8, 2, 'i']]],
  },
}

const cache = new Map<string, Frame>()

// a hex color as a dark grey of the same lightness, for a crab that has lost the run
const grey = (hex: string): string => {
  const n = Number.parseInt(hex.slice(1), 16)
  const luma = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11
  const h = Math.round(luma * 0.55 + 20).toString(16).padStart(2, '0')

  return `#${h}${h}${h}`
}

/**
 * One pose of one costume, rows top to bottom, `MINI_W` wide.
 * `step` picks the leg and prop frame (0 or 1), `air` tucks the legs, `dead` greys it out.
 */
export const miniFrame = (id: CostumeId, step: 0 | 1, air = false, dead = false): Frame => {
  const key = `${id}:${step}:${air ? 1 : 0}:${dead ? 1 : 0}`
  const hit = cache.get(key)
  if (hit) return hit

  const def = MINI[id]
  const legs = air ? LEGS.air : LEGS.walk[step]
  const rows = [...def.hat, ...BODY, legs]
  const palette: Record<string, string> = { ...def.palette, c: CLAY, k: def.palette.k ?? INK }
  const frame: Frame = rows.map(r => [...r].map(ch => (ch === '.' ? null : (palette[ch] ?? null))))
  for (const [x, y, ch] of def.props[step]) {
    const row = frame[y]
    if (row) row[x] = palette[ch] ?? null
  }
  const out = dead ? frame.map(r => r.map(p => (p ? grey(p) : null))) : frame
  cache.set(key, out)

  return out
}

export const miniHeight = (id: CostumeId): number => MINI[id].hat.length + BODY.length + 1

/**
 * Two pixel rows to one cell row: ▀ carries the upper pixel (and the lower as background),
 * ▄ a lone lower pixel. `px` is rows top to bottom; an odd last row has nothing under it.
 */
export const toCells = (px: Frame): Cell[][] => {
  const out: Cell[][] = []
  for (let r = 0; r < px.length; r += 2) {
    const top = px[r] ?? []
    const bottom = px[r + 1] ?? []
    out.push(
      top.map((t, c): Cell => {
        const b = bottom[c] ?? null
        if (t && b) return t === b ? { ch: '█', fg: t } : { ch: '▀', fg: t, bg: b }
        if (t) return { ch: '▀', fg: t }
        if (b) return { ch: '▄', fg: b }
        return { ch: ' ' }
      }),
    )
  }

  return out
}

/** Neighbouring cells with the same look joined into one run, so a row draws as a few `Text`s. */
export const toRuns = (cells: Cell[]): { text: string; fg?: string; bg?: string }[] => {
  const runs: { text: string; fg?: string; bg?: string }[] = []
  for (const c of cells) {
    const last = runs[runs.length - 1]
    if (last && last.fg === c.fg && last.bg === c.bg) last.text += c.ch
    else runs.push({ text: c.ch, fg: c.fg, bg: c.bg })
  }

  return runs
}
