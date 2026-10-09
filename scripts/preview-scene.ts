// Writes a few frames of the desktop scene to one HTML page, for looking at the art:
//   node --import ./scripts/ts-loader.mjs scripts/preview-scene.ts out.html
import { writeFileSync } from 'node:fs'

import { act, deskConfig, fresh, lookFor, ROTATION, step } from '../hooks/crab/game'
import { sceneSvg } from '../hooks/crab/scene'

const cells: string[] = []
for (const costume of ROTATION.filter((_, n) => n % 2 === 0 || n === 5)) {
  let g = act(fresh(120, 7, 'ready', { ...lookFor(costume, 0) }, deskConfig), deskConfig)
  const frames: string[] = []
  for (let i = 0; i < 260; i++) {
    g = { ...g, obs: i === 0 ? g.obs : g.obs }
    if (i === 130 || i === 134) g = act(g, deskConfig)
    g = step(g, deskConfig)
    if (g.mode === 'over') break
    if (i === 20 || i === 100 || i === 140 || i === 150) frames.push(sceneSvg(g, deskConfig, { width: 1020, height: 204 }))
  }
  cells.push(`<h3>${costume}</h3>${frames.slice(0, 4).map(f => `<div>${f}</div>`).join('')}`)
}
writeFileSync(process.argv[2] ?? 'scene.html', `<!doctype html><meta charset=utf-8><body style="background:#f0efec;font:13px system-ui;margin:16px">${cells.join('')}`)
