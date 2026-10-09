// The Claude crab ("Clawd"): the full-size pixel sprites, one costume per tier.
//
// Saved from johnnyvizz/claude-kit, plugins/savvy-progress (MIT, (c) 2026 johnnyvizz), which
// itself traces DockCrab's Clawdy. The drawing code is kept as the source of truth and run once
// into plain layers, so every other form (SVG, PNG, JSON, the game's small sprites) is derived
// from the same pixels. Nothing here touches `$`: it is data and pure functions only.

export type Rect = readonly [x: number, y: number, w: number, h: number, color: string]
/** Named groups of rects: `bd` the body and its costume, `la`/`lb` the leg pairs, the rest props. */
export type Layers = Record<string, Rect[]>

import type { CostumeId } from '../../types'

export type { CostumeId }

export type Costume = {
  id: CostumeId
  /** the savvy-flow tier this costume was made for */
  tier: string
  /** the tier's color, used on the costume's accent */
  accent: string
  /** what it wears, and the prop that moves */
  note: string
}

export const GRID = { w: 30, h: 28 } as const
export const CLAY = '#D97757'
export const INK = '#1F1E1D'

export const COSTUMES: readonly Costume[] = [
  { id: 'plain', tier: 'other', accent: '#888780', note: 'no costume' },
  { id: 'astronaut', tier: 'fable', accent: '#7F77DD', note: 'glass dome; floats, antenna and star blink' },
  { id: 'detective', tier: 'heavy', accent: '#D85A30', note: 'deerstalker; the magnifier sweeps and glints' },
  { id: 'engineer', tier: 'careful', accent: '#BA7517', note: 'hard hat; the wrench turns a bolt' },
  { id: 'chef', tier: 'medium', accent: '#378ADD', note: 'toque; tosses the omelette' },
  { id: 'racer', tier: 'light', accent: '#1D9E75', note: 'helmet; runs at double pace, flag flutters' },
  { id: 'pirate', tier: 'explore', accent: '#888780', note: 'tricorn; the cutlass fences' },
]

type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// `armCls` lets a raised claw travel with the prop it holds.
const crabBody = (f: Fill, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

const DRAW: Record<CostumeId, (f: Fill, t: string) => void> = {
  plain: f => crabBody(f),
  astronaut: (f, t) => {
    crabBody(f)
    f(6, 7, 18, 1, '#E6E8EE'); f(5, 8, 1, 14, '#E6E8EE'); f(24, 8, 1, 14, '#E6E8EE'); f(6, 22, 18, 1, '#C9CCD2')
    f(6, 8, 18, 14, 'rgba(169,214,245,.32)'); f(8, 9, 2, 1, '#fff'); f(8, 10, 1, 2, '#fff')
    f(14, 4, 2, 3, '#C9CCD2'); f(14, 2, 2, 2, t, 'ant'); f(13, 18, 4, 2, t)
    f(27, 3, 1, 3, '#F5C542', 'star'); f(26, 4, 3, 1, '#F5C542', 'star')
  },
  detective: (f, t) => {
    crabBody(f, -4, 'it')
    stamp(f, 6, 3, ['......bbbbbb......', '....bbcbbcbbbb....', '...bbbbbbbbbbbb...', '..bcbbcbbcbbcbbb..', '.bbbbbbbbbbbbbbbb.', 'dddddddddddddddddd'], { b: '#7A4A26', c: '#A0703F', d: '#5A3519' })
    f(6, 9, 18, 1, t)
    stamp(f, 23, 1, ['.kkk.', 'k...k', 'k...k', 'k...k', '.kkk.'], { k: '#3A3A3C' }, 'it')
    f(24, 2, 3, 3, 'rgba(169,214,245,.7)', 'it'); f(25, 6, 1, 4, '#7A4A26', 'it'); f(24, 2, 1, 1, '#fff', 'gl')
  },
  engineer: (f, t) => {
    crabBody(f)
    stamp(f, 6, 4, ['.....yyyyyyyy.....', '...yyyyyhhyyyyy...', '..yyyyyyhhyyyyyy..', '..yyyyyyhhyyyyyy..', '.yyyyyyyhhyyyyyyy.', 'dddddddddddddddddd'], { y: '#F5C542', h: '#FBE08A', d: '#C99A1E' })
    f(13, 5, 4, 2, t)
    stamp(f, 0, 10, ['.s.s', 'sss.', '.s..', '.s..'], { s: '#8E929A' }, 'it')
  },
  chef: (f, t) => {
    crabBody(f, -4, 'pan')
    stamp(f, 6, 0, ['........lll.......', '.......lllll......', '.wwwwgwwwwwwgwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwgwwwwwggwwwww', '.wwwwgwwwwwggwwwww', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.'], { w: '#F4F3EE', l: '#F7F6F2', g: '#D2D1C8', b: t, d: '#B45F43' })
    f(22, 8, 7, 2, '#4A4A48', 'pan'); f(26, 10, 1, 1, '#4A4A48', 'pan'); f(24, 7, 3, 1, '#F5B731', 'egg')
  },
  racer: (f, t) => {
    crabBody(f, -4)
    stamp(f, 6, 5, ['....rrrrrrrrrr....', '..rrrrrrwwrrrrrr..', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.kkkkkkkkkkkkkkkkr'], { r: t, w: '#F8F6F1', k: INK })
    f(25, 1, 1, 9, '#8E929A')
    stamp(f, 26, 1, ['wkwk', 'kwkw', 'wkwk'], { w: '#F8F6F1', k: INK }, 'flag')
  },
  pirate: f => {
    crabBody(f)
    stamp(f, 5, 3, ['.kk..............kk.', '.kkk....kkkk....kkk.', '..kkkkkkkwwkkkkkkk..', '..kkkkkkkkkkkkkkkk..', '.gggggggggggggggggg.'], { k: '#55514C', w: '#F8F6F1', g: '#F5C542' })
    f(7, 11, 11, 1, INK); f(18, 11, 4, 3, INK)
    f(27, 6, 1, 9, '#C9CCD2', 'it'); f(26, 15, 3, 1, '#7A4A26', 'it')
  },
}

export const costume = (id: CostumeId): Costume => COSTUMES.find(c => c.id === id) ?? COSTUMES[0]!

/** Runs a costume's drawing into its layers: `bd` first, then every prop, then the legs. */
export const layers = (id: CostumeId): Layers => {
  const out: Layers = { bd: [] }
  const f: Fill = (x, y, w, h, c, cls = 'bd') => {
    ;(out[cls] ??= []).push([x, y, w, h, c])
  }
  DRAW[id](f, costume(id).accent)

  return out
}

/** Paint order: body, then props (each its own motion), then the two leg pairs. */
export const paintOrder = (l: Layers): string[] => [
  'bd',
  ...Object.keys(l).filter(k => k !== 'bd' && k !== 'la' && k !== 'lb'),
  'la',
  'lb',
]

// Pure CSS, run by the compositor: no redraws. Every crab walks; each costume adds its prop's
// own motion on top. Keyed on the tier class the upstream uses (`c-fable`, ...).
export const CSS = `.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
.c-fable.run{animation:float 1s ease-in-out infinite}
.c-fable.run .la,.c-fable.run .lb,.c-fable.run .bd{animation:none}
.c-fable.run .ant{animation:blink 1s steps(1) infinite}
.c-fable.run .star{animation:blink .5s steps(1) infinite -.25s}
@keyframes float{50%{transform:translateY(-2px)}}@keyframes blink{50%{opacity:.15}}
.c-heavy.run .it{animation:scan 1s steps(1) infinite}
.c-heavy.run .gl{animation:blink 1s steps(1) infinite -.5s}
@keyframes scan{25%{transform:translate(-1px,1px)}50%{transform:translate(-2px,2px)}75%{transform:translate(-1px,1px)}}
.c-careful.run .it{transform-origin:100% 100%;animation:twist .5s ease-in-out infinite}
@keyframes twist{50%{transform:rotate(-35deg)}}
.c-medium.run .pan{transform-origin:0 50%;animation:tilt 1s ease-in-out infinite}
.c-medium.run .egg{animation:flip 1s ease-in-out infinite}
@keyframes tilt{20%,40%{transform:rotate(-12deg)}}@keyframes flip{30%{transform:translateY(-5px) scaleY(-1)}60%{transform:translateY(0)}}
.c-light.run .la{animation-duration:.25s}.c-light.run .lb{animation-duration:.25s;animation-delay:-.125s}
.c-light.run .flag{transform-origin:0 50%;animation:wave .25s steps(1) infinite}
@keyframes wave{50%{transform:skewY(-12deg) scaleX(.85)}}
.c-explore.run .it{transform-origin:50% 100%;animation:fence .5s ease-in-out infinite}
@keyframes fence{50%{transform:rotate(25deg)}}
@media (prefers-reduced-motion: reduce){.run,.run g{animation:none!important}}`

const rect = ([x, y, w, h, c]: Rect) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`

/** A standalone SVG of one costume; `animated` adds the walk and the prop's motion. */
export const toSvg = (id: CostumeId, opts: { scale?: number; animated?: boolean; background?: string } = {}): string => {
  const { scale = 8, animated = true, background } = opts
  const l = layers(id)
  const group = (cls: string) => `<g class="${cls}">${(l[cls] ?? []).map(rect).join('')}</g>`
  const props = paintOrder(l).filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const body = `<g class="bd">${(l.bd ?? []).map(rect).join('')}${props.map(group).join('')}</g>`
  const run = animated ? ' run' : ''
  const w = GRID.w * scale
  const h = GRID.h * scale
  const bg = background ? `<rect width="${GRID.w}" height="${GRID.h}" fill="${background}"/>` : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${GRID.w} ${GRID.h}" shape-rendering="crispEdges"><title>Claude crab: ${id}</title><style>${CSS}</style>${bg}<g class="c-${costume(id).tier}${run}">${body}${group('la')}${group('lb')}</g></svg>`
}
