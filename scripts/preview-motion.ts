// Writes one HTML page that plays the animated scene, for looking at it and for scrubbing time:
//   node --import ./scripts/ts-loader.mjs scripts/preview-motion.ts out.html [score]
// The page holds the same markup the band sends, once inline (so a test can seek it) and once as an image.
import { writeFileSync } from 'node:fs'

import { act, deskConfigFor, fresh, lookFor, step } from '../hooks/crab/game'
import { pilot } from '../hooks/crab/pilot'
import { motionSvg } from '../hooks/crab/scene'

const cfg = deskConfigFor(420)

const bot = pilot

const start = Number(process.argv[3] ?? 0)
let g = act(fresh(120, 11, 'ready', lookFor('chef'), cfg), cfg)
for (let i = 0; i < 4000 && g.score < start; i++) g = step(bot(g, cfg, { stomp: process.env.STOMP === '1' }), cfg)

// the plan is the run as this player plays it, a press at a time
const plan = [g]
for (let i = 0; i < 144; i++) {
  const last = plan[plan.length - 1] ?? g
  plan.push(last.mode === 'play' ? step(bot(last, cfg, { stomp: process.env.STOMP === '1' }), cfg) : last)
}
const svg = motionSvg({ states: plan, phase: 0.4 }, cfg, { width: 840, height: Math.round((840 * 72) / 420) })
const body = `<h3>inline (seekable) — ${svg.length} chars, score ${Math.floor(g.score)}</h3><div id="a" style="background:#f0efed;display:inline-block">${svg}</div>
<h3>as image</h3><img id="b" style="background:#f0efed" src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}">`
writeFileSync(process.argv[2] ?? 'motion.html', `<!doctype html><meta charset=utf-8><body style="font:13px system-ui;margin:16px">${body}`)
console.log('chars', svg.length)
