// Writes a few frames of the desktop scene to one HTML page, for looking at the art:
//   node --import ./scripts/ts-loader.mjs scripts/preview-scene.ts out.html
import { writeFileSync } from 'node:fs'

import { act, deskConfig, fresh, lookFor, ROTATION, step } from '../hooks/crab/game'
import { sceneSvg } from '../hooks/crab/scene'

const cells: string[] = []
for (const costume of ROTATION.filter((_, n) => n % 2 === 0 || n === 5)) {
  let g = act(fresh(120, 7, 'ready', { ...lookFor(costume, 0) }, deskConfig), deskConfig)
  const frames: string[] = []
  for (let i = 0; i < 80; i++) {
    if (i === 30) g = act(g, deskConfig)
    g = step(g, deskConfig)
    if (g.mode === 'over') break
    if (i === 10 || i === 33 || i === 35 || i === 60) frames.push(sceneSvg(g, deskConfig, { width: 1020, height: 204 }))
  }
  cells.push(`<h3>${costume}</h3>${frames.slice(0, 4).map(f => `<div>${f}</div>`).join('')}`)
}
writeFileSync(process.argv[2] ?? 'scene.html', `<!doctype html><meta charset=utf-8><body style="background:#f0efec;font:13px system-ui;margin:16px">${cells.join('')}`)
