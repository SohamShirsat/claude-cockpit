// Writes the pages that docs/*.png are screenshots of, from the mod's own scene code:
//   node --import ./scripts/ts-loader.mjs scripts/make-docs.ts <out-dir>
// then screenshot each page (see docs/README.md).
import { mkdirSync, writeFileSync } from 'node:fs'

import { act, deskConfig, fresh, header, lookFor, ROTATION } from '../hooks/crab/game'
import type { Game } from '../hooks/crab/game'
import { crabGroup, sceneSvg } from '../hooks/crab/scene'

const out = process.argv[2] ?? 'docs-build'
mkdirSync(out, { recursive: true })

const CSS = `
:root{color-scheme:light}
body{margin:0;background:#fbfaf8;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1f1e1d}
.wrap{width:760px;padding:28px;box-sizing:border-box}
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

const W = 640
const H = 128
const base = (g: Partial<Game>): Game => ({ ...act(fresh(377, 7, 'ready', lookFor('plain', 0), deskConfig), deskConfig), ...g })

const panel = (g: Game, bandRow: boolean) => `<div class="panel">${
  bandRow
    ? `<div class="band"><div>ctx<b>8%</b><span class="d">·</span>cache<b>55m</b><span class="d">·</span>5h<b>29%</b><span class="d">·</span>7d<b>46%</b></div><div class="r"><span>■ close</span><span>⤴ Handoff</span></div></div>`
    : ''
}<p class="hd"><i>✻</i>${header(g)}</p>${sceneSvg(g, deskConfig, { width: W, height: H })}</div>`

const playing = base({
  tick: 37,
  y: 21,
  jump: 7,
  score: 214.4,
  grabbed: 3,
  off: 400,
  obs: [
    { x: 150, w: 12, h: 9, tall: false },
    { x: 262, w: 12, h: 13, tall: true },
  ],
  clouds: [
    { x: 74, w: 16, h: 44 },
    { x: 214, w: 16, h: 38 },
  ],
  pops: [{ x: 58, h: 42, age: 3 }],
})
const ready = { ...fresh(377, 7, 'ready', lookFor('astronaut', 0), deskConfig) }
const over = base({ mode: 'over', score: 95.2, grabbed: 1, off: 300, obs: [{ x: 48, w: 12, h: 9, tall: false }], clouds: [{ x: 190, w: 16, h: 40 }] })

writeFileSync(
  `${out}/preview.html`,
  `<!doctype html><meta charset=utf-8><style>${CSS}</style><body><div class="wrap">
<div class="cap">Playing: grab the clouds, dodge the bugs</div>${panel(playing, true)}
<div class="cap">Waiting to start</div>${panel(ready, false)}
<div class="cap">Game over</div>${panel(over, false)}</div>`,
)

const TIER: Record<string, string> = {
  plain: 'the walk', astronaut: 'floats, antenna blinks', detective: 'magnifier sweeps', engineer: 'turns a bolt',
  chef: 'tosses the omelette', racer: 'runs at double pace', pirate: 'fences with a cutlass',
}
const tiles = ROTATION.map(
  c => `<div class="tile"><svg viewBox="0 0 30 28" width="150" height="140" shape-rendering="crispEdges">${crabGroup(c, 0, false, false)}</svg><b>${c}</b><small>${TIER[c]}</small></div>`,
).join('')
writeFileSync(`${out}/costumes.html`, `<!doctype html><meta charset=utf-8><style>${CSS}</style><body><div class="grid">${tiles}</div>`)
console.log(`wrote ${out}/preview.html and costumes.html`)
