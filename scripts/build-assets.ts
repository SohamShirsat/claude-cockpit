// Writes every form of the crab into assets/crab/: SVG (animated and still), PNG, one JSON of all
// the pixels, and a preview sheet. Run from the mod folder:
//   node --import ./scripts/ts-loader.mjs scripts/build-assets.ts
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

import { COSTUMES, GRID, layers, paintOrder, toSvg } from '../hooks/crab/master'
import { ARC, HIT, MINI_W, miniFrame } from '../hooks/crab/mini'
import type { Frame } from '../hooks/crab/mini'

const out = new URL('../assets/crab/', import.meta.url).pathname
for (const d of ['svg', 'png']) mkdirSync(`${out}${d}`, { recursive: true })

// --- a minimal PNG writer: RGBA, no filter, one IDAT
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (b: Buffer) => {
  let c = 0xffffffff
  for (const x of b) c = (crcTable[(c ^ x) & 255] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}
const png = (w: number, h: number, rgba: Uint8Array) => {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(w, 0)
  head.writeUInt32BE(h, 4)
  head.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const parse = (c: string): [number, number, number, number] => {
  if (c.startsWith('#')) {
    const hex = c.length === 4 ? [...c.slice(1)].map(x => x + x).join('') : c.slice(1)
    const n = Number.parseInt(hex, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(c)
  if (!m) throw new Error(`color ${c}`)
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
}

// paint into an RGBA buffer, source-over
const blend = (buf: Uint8Array, i: number, [r, g, b, a]: [number, number, number, number]) => {
  const da = (buf[i + 3] ?? 0) / 255
  const oa = a + da * (1 - a)
  for (const [k, v] of [r, g, b].entries()) buf[i + k] = Math.round((v * a + (buf[i + k] ?? 0) * da * (1 - a)) / (oa || 1))
  buf[i + 3] = Math.round(oa * 255)
}

const rasterCostume = (id: (typeof COSTUMES)[number]['id'], scale: number) => {
  const w = GRID.w * scale
  const h = GRID.h * scale
  const buf = new Uint8Array(w * h * 4)
  const l = layers(id)
  for (const cls of paintOrder(l)) {
    for (const [x, y, rw, rh, c] of l[cls] ?? []) {
      const col = parse(c)
      for (let py = y * scale; py < (y + rh) * scale; py++) for (let px = x * scale; px < (x + rw) * scale; px++) blend(buf, (py * w + px) * 4, col)
    }
  }
  return png(w, h, buf)
}

const rasterFrames = (frames: Frame[], scale: number, gap = 1) => {
  const fw = MINI_W
  const fh = Math.max(...frames.map(f => f.length))
  const w = (frames.length * (fw + gap) - gap) * scale
  const h = fh * scale
  const buf = new Uint8Array(w * h * 4)
  frames.forEach((f, n) => {
    f.forEach((row, r) =>
      row.forEach((c, x) => {
        if (!c) return
        const col = parse(c)
        const oy = fh - f.length + r
        for (let py = oy * scale; py < (oy + 1) * scale; py++) for (let px = (n * (fw + gap) + x) * scale; px < (n * (fw + gap) + x + 1) * scale; px++) blend(buf, (py * w + px) * 4, col)
      }),
    )
  })
  return png(w, h, buf)
}

// --- write everything
const data = COSTUMES.map(c => {
  const walk0 = miniFrame(c.id, 0)
  const walk1 = miniFrame(c.id, 1)
  const air = miniFrame(c.id, 0, true)
  writeFileSync(`${out}svg/${c.id}.svg`, toSvg(c.id, { scale: 8 }))
  writeFileSync(`${out}svg/${c.id}.still.svg`, toSvg(c.id, { scale: 8, animated: false }))
  writeFileSync(`${out}png/${c.id}.png`, rasterCostume(c.id, 16))
  writeFileSync(`${out}png/${c.id}.mini.png`, rasterFrames([walk0, walk1, air, miniFrame(c.id, 0, false, true)], 16))
  const l = layers(c.id)
  return { ...c, paintOrder: paintOrder(l), layers: l, mini: { walk0, walk1, air, dead: miniFrame(c.id, 0, false, true) } }
})

writeFileSync(
  `${out}sprites.json`,
  `${JSON.stringify(
    {
      about: 'Claude crab sprites. layers: [x, y, w, h, color] rects on grid, painted in paintOrder (bd, props, la, lb). mini: 9px-wide game frames, rows top to bottom, null = empty.',
      source: 'johnnyvizz/claude-kit plugins/savvy-progress (MIT), after DockCrab Clawdy',
      grid: GRID,
      miniWidth: MINI_W,
      hit: HIT,
      jumpArc: ARC,
      costumes: data,
    },
    null,
    1,
  )}\n`,
)

const cards = COSTUMES.map(
  c => `<figure><img src="svg/${c.id}.svg" alt="${c.id}" width="240"><img src="png/${c.id}.mini.png" alt="${c.id} at game size" class="mini"><figcaption><b>${c.id}</b> <i>${c.tier}</i><br>${c.note}</figcaption></figure>`,
).join('\n')
writeFileSync(
  `${out}sheet.html`,
  `<!doctype html><meta charset="utf-8"><title>Claude crab sheet</title>
<style>body{font:14px system-ui;background:#1f1e1d;color:#ecebe8;margin:32px}h1{font-weight:600}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
figure{margin:0;background:#2c2c2b;border-radius:12px;padding:16px}figcaption{margin-top:8px;color:#a8a8a4}
.mini{display:block;image-rendering:pixelated;width:100%;margin-top:12px}i{color:#7d7d79}</style>
<h1>Claude crab</h1><p>Top: full size, animated. Below: the game-size frames (walk, walk, jump, game over).</p><main>${cards}</main>`,
)
console.log(`wrote ${COSTUMES.length} costumes to ${out}`)
