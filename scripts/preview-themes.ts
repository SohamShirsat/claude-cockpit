// Writes one HTML page with every theme drawn as a still, with everything that can come at the crab, for
// looking at the art (light and dark card):
//   node --import ./scripts/ts-loader.mjs scripts/preview-themes.ts out.html [width]
import { writeFileSync } from 'node:fs'

import { deskConfigFor, fresh, lookFor } from '../hooks/crab/game'
import type { Game } from '../hooks/crab/game'
import { sceneSvg } from '../hooks/crab/scene'
import { STAGES } from '../hooks/crab/stages'

const units = Number(process.argv[3] ?? 420)
const cfg = deskConfigFor(units)
const px = 2

const cells = STAGES.map((stage, i) => {
  const crowd: Game = {
    ...fresh(377, 3, 'play', lookFor('auto'), cfg),
    costume: stage.costume,
    stage: i,
    stageAge: i > 0 ? 20 : -1,
    tick: 40 + i * 7,
    off: 400 + i * 123,
    score: 120 + i * 100,
    y: 14,
    jump: 6,
    obs: [
      { id: 1, x: 120, w: 12, h: 24, base: 0, tall: false, kind: 'tower' },
      { id: 2, x: Math.round(units * 0.5), w: 12, h: 13, base: 0, tall: true, kind: 'beetle' },
      { id: 3, x: Math.round(units * 0.6), w: 12, h: 9, base: 0, tall: false, kind: 'bug' },
      { id: 4, x: Math.round(units * 0.72), w: 14, h: 9, base: 11, tall: false, kind: 'moth' },
      { id: 5, x: Math.round(units * 0.85), w: 30, h: 0, base: 0, tall: false, kind: 'pit' },
    ],
    clouds: [{ id: 6, x: 80, w: 16, h: 40 }, { id: 7, x: Math.round(units * 0.4), w: 10, h: 28, t: 10, shield: true }],
    pops: [{ id: 8, x: 60, h: 40, age: 2, kind: 'spark' }, { id: 10, x: 50, h: 30, age: 4, kind: 'text', text: '+25' }],
    note: i === 3 ? 'moth! duck under it with ↓ or J' : '',
    noteAge: i === 3 ? 3 : -1,
  }

  return `<h4>${i}: ${stage.name} (${stage.costume})</h4><div class="card">${sceneSvg(crowd, cfg, { width: units * px, height: 72 * px })}</div>`
})

const css = 'body{font:13px system-ui;margin:16px;background:#faf9f7;color:#222}.card{background:#f0efec;border-radius:12px;padding:8px;display:inline-block;margin-bottom:6px}@media (prefers-color-scheme: dark){body{background:#1f1f1e;color:#ddd}.card{background:#2b2b29}}h4{margin:10px 0 4px}'
writeFileSync(process.argv[2] ?? 'themes.html', `<!doctype html><meta charset=utf-8><style>${css}</style><body>${cells.join('')}`)
console.log('wrote', cells.length, 'themes')
