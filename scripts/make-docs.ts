// Writes the pages that docs/*.png are screenshots of, from the mod's own scene code:
//   node --import ./scripts/ts-loader.mjs scripts/make-docs.ts <out-dir>
// then screenshot each page (see docs/README.md).
import { mkdirSync, writeFileSync } from 'node:fs'

import { act, deskConfig, deskLine, fresh, lookFor, ROTATION } from '../hooks/crab/game'
import type { Game } from '../hooks/crab/game'
import { crabGroup, sceneSvg } from '../hooks/crab/scene'

const out = process.argv[2] ?? 'docs-build'
mkdirSync(out, { recursive: true })

const CSS = `
:root{color-scheme:light}
body{margin:0;background:#fbfaf8;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1f1e1d}
.wrap{width:800px;padding:28px;box-sizing:border-box}
.cap{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#85837d;margin:18px 4px 8px}
.cap:first-child{margin-top:0}
.panel{background:#f0efed;border-radius:14px;padding:14px 16px 12px}
.band{display:flex;justify-content:space-between;color:#85837d;font-size:15px;margin-bottom:10px}
.band b{color:#2e7d32;margin-left:4px}.band .d{margin:0 6px}
.band .r{color:#1f1e1d;display:flex;gap:22px}
.hd{color:#85837d;font-size:15px;margin:0 0 4px}
.hd i{color:#c4623f;font-style:normal;font-weight:700;margin-right:2px}
svg{display:block}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;width:760px;padding:28px;box-sizing:border-box}
.tile{background:#f0efed;border-radius:14px;padding:12px 8px 10px;text-align:center}
.tile small{display:block;color:#85837d;font-size:12px;margin-top:6px}
.tile b{font-size:14px}
`

const W = 728
const H = Math.round((W * 72) / deskConfig.width)
const base = (g: Partial<Game>): Game => ({ ...act(fresh(377, 7, 'ready', lookFor('plain', 0), deskConfig), deskConfig), ...g })

const panel = (g: Game, bandRow: boolean) => `<div class="panel">${
  bandRow
    ? `<div class="band"><div>ctx<b>8%</b><span class="d">·</span>cache<b>55m</b><span class="d">·</span>5h<b>29%</b><span class="d">·</span>7d<b>46%</b></div><div class="r"><span>■ close</span><span>⤴ Handoff</span></div></div>`
    : ''
}<p class="hd"><i>✻</i>${deskLine(g, 'any key')}</p>${sceneSvg(g, deskConfig, { width: W, height: H })}</div>`

const bug = (id: number, x: number, kind: Game['obs'][number]['kind'], w: number, h: number, base = 0): Game['obs'][number] => ({ id, x, w, h, base, tall: kind === 'beetle', kind })
const playing = base({
  tick: 37,
  y: 21,
  jump: 7,
  score: 314.4,
  grabbed: 3,
  fixed: 6,
  off: 400,
  shield: true,
  obs: [bug(1, 168, 'bug', 12, 9), bug(2, 222, 'moth', 14, 9, 11), bug(3, 262, 'beetle', 12, 13), bug(4, 340, 'pit', 30, 0)],
  clouds: [
    { id: 5, x: 90, w: 16, h: 44 },
    { id: 6, x: 190, w: 10, h: 30, t: 10, shield: true },
  ],
  pops: [{ id: 7, x: 74, h: 42, age: 3, kind: 'spark' }, { id: 8, x: 128, h: 14, age: 4, kind: 'poof' }, { id: 9, x: 112, h: 26, age: 6, kind: 'text', text: 'x2 +20' }],
  note: 'moth! duck under it with ↓ or J',
  noteAge: 12,
})
const ready = { ...fresh(377, 7, 'ready', lookFor('astronaut', 0), deskConfig) }
const over = base({ mode: 'over', score: 95.2, grabbed: 1, off: 300, obs: [bug(1, 48, 'bug', 12, 9)], clouds: [{ id: 2, x: 190, w: 16, h: 40 }] })

writeFileSync(
  `${out}/preview.html`,
  `<!doctype html><meta charset=utf-8><style>${CSS}</style><body><div class="wrap">
<div class="cap">Playing: jump, fix or duck the bugs</div>${panel(playing, true)}
<div class="cap">Waiting to start</div>${panel(ready, false)}
<div class="cap">Game over</div>${panel(over, false)}</div>
<script>addEventListener('load',()=>document.querySelectorAll('svg').forEach(s=>{if(s.pauseAnimations){s.pauseAnimations();s.setCurrentTime(0.02)}}))</script>`,
)

const TIER: Record<string, string> = {
  plain: 'the walk', astronaut: 'floats, antenna blinks', detective: 'magnifier sweeps', engineer: 'turns a bolt',
  chef: 'tosses the omelette', racer: 'runs at double pace', pirate: 'fences with a cutlass',
}
const tiles = ROTATION.map(
  c => `<div class="tile"><svg viewBox="0 0 30 28" width="150" height="140" shape-rendering="crispEdges">${crabGroup(c, 0, false, false)}</svg><b>${c}</b><small>${TIER[c]}</small></div>`,
).join('')
writeFileSync(`${out}/costumes.html`, `<!doctype html><meta charset=utf-8><style>${CSS}</style><body><div class="grid">${tiles}</div>`)

// ---- the band on its own: what the numbers look like, and the handoff buttons ----
const BAND_CSS = `
.row{display:flex;justify-content:space-between;align-items:center;background:#f0efed;border-radius:14px;padding:13px 18px;margin-bottom:10px;font-size:16px;color:#85837d}
.row .m{display:flex;gap:6px;align-items:baseline}.row .m b{margin-left:4px}.row .d{margin:0 4px}
.g{color:#2e7d32}.y{color:#b26a00}.r{color:#c62828}
.row .r2{display:flex;gap:22px;color:#1f1e1d;align-items:center}
.row .conf{background:#c4623f;color:#fff;border-radius:8px;padding:3px 10px;font-weight:600}
.row .mascot{color:#85837d}.row .mascot i{color:#c4623f;font-style:normal;font-weight:700}
.row .play{color:#1f1e1d}
.note{font-size:12px;color:#85837d;margin:-2px 6px 14px}
`
const cell = (label: string, val: string, cls: string, extra = '') =>
  `<span>${label}<b class="${cls}">${val}</b>${extra ? ` <small>${extra}</small>` : ''}</span>`
const metrics = (parts: string[]) => `<div class="m">${parts.join('<span class="d">·</span>')}</div>`
const bandRow = (m: string[], right: string) => `<div class="row">${metrics(m)}<div class="r2">${right}</div></div>`
const bandPage = `<!doctype html><meta charset=utf-8><style>${CSS}${BAND_CSS}</style><body><div class="wrap">
<div class="cap">Calm: plenty of room, cache warm, limits low</div>
${bandRow([cell('ctx', '12%', 'g', '24.0k/200k'), cell('cache', '58m', 'g', '91% hit'), cell('5h', '18%', 'g', '↻3h 20m'), cell('7d', '31%', 'g', '↻4d 2h')], '<span>⤴ Handoff</span>')}
<div class="cap">Getting full: time to think about a handoff</div>
${bandRow([cell('ctx', '72%', 'y', '144k/200k'), cell('cache', '9m', 'y', '88% hit'), cell('5h', '64%', 'y', '↻1h 05m'), cell('7d', '47%', 'g', '↻2d 6h')], '<span>⤴ Handoff</span>')}
<div class="cap">Almost out: hand off now</div>
${bandRow([cell('ctx', '91%', 'r', '182k/200k'), cell('cache', '1m', 'r', '90% hit'), cell('5h', '93%', 'r', '↻22m'), cell('7d', '66%', 'y', '↻1d 9h')], '<span>⤴ Handoff</span>')}
<div class="cap">Handoff, step 1: one click asks, a second click confirms</div>
${bandRow([cell('ctx', '72%', 'y'), cell('cache', '9m', 'y'), cell('5h', '64%', 'y'), cell('7d', '47%', 'g')], '<span class="conf">✓ Confirm handoff?</span>')}
<div class="cap">While Claude works: mascot and timer, plus the play button</div>
${bandRow([cell('ctx', '33%', 'g'), cell('cache', '60m', 'g'), cell('5h', '22%', 'g'), cell('7d', '35%', 'g')], '<span class="play">▶ play</span><span class="mascot"><i>✻</i> still on it · 0:47</span>')}
</div>`
writeFileSync(`${out}/band.html`, bandPage)

// ---- the field guide: every kind of thing in the game, one tile each ----
const guideTile = (title: string, text: string, g: Game) => {
  const cw = 1000 // a bigger scale than the preview, so a bug is easy to see
  const gh = Math.round((cw * 72) / deskConfig.width)
  const px = cw / deskConfig.width
  const left = Math.round(66 * px) // 66 units in: the crab's own spot is out of the frame
  return `<div class="tile"><div style="width:190px;height:${Math.round(gh * 0.66)}px;overflow:hidden;border-radius:8px;background:#f7f6f4;margin-bottom:8px"><div style="margin-left:-${left}px;margin-top:-${Math.round(gh * 0.3)}px">${sceneSvg(g, deskConfig, { width: cw, height: gh })}</div></div><b>${title}</b><small>${text}</small></div>`
}
const one = (obs: Game['obs'], clouds: Game['clouds'] = []) => base({ mode: 'play', tick: 10, off: 0, obs, clouds, note: '', noteAge: 0, y: 0, jump: 0 })
const guide = [
  guideTile('Ladybug', 'jump it, or land on it: +10', one([bug(1, 88, 'bug', 12, 9)])),
  guideTile('Big beetle', 'land on it for double', one([bug(1, 88, 'beetle', 12, 13)])),
  guideTile('Moth', 'flies high: duck (↓ or J)', one([bug(1, 88, 'moth', 14, 9, 11)])),
  guideTile('Twin bugs', 'one long jump', one([bug(1, 82, 'twin', 27, 9)])),
  guideTile('Segfault pit', 'a gap: jump it', one([bug(1, 80, 'pit', 34, 0)])),
  guideTile('Cloud', 'grab it: +25', one([], [{ id: 2, x: 92, w: 16, h: 22 }])),
  guideTile('Green ✓ orb', 'a shield: takes one hit', one([], [{ id: 3, x: 96, w: 10, h: 22, t: 10, shield: true }])),
]
writeFileSync(
  `${out}/guide.html`,
  `<!doctype html><meta charset=utf-8><style>${CSS}.grid{grid-template-columns:repeat(4,1fr);width:960px}.tile{padding:10px 8px}.tile small{font-size:12.5px}</style><body><div class="grid">${guide.join('')}</div>`,
)
console.log(`wrote ${out}/preview.html, costumes.html, band.html and guide.html`)
