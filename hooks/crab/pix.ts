// Small helpers for drawing pixel art as SVG paths: shared by the scene and by the themes. Pure.

/** A position to a tenth of a unit: moves smoothly, and the markup stays short. */
export const r1 = (n: number) => Math.round(n * 10) / 10
export const r2 = (n: number) => Math.round(n * 100) / 100
export const r4 = (n: number) => Math.round(n * 10000) / 10000

/** A stable pseudo-random number in [0, 1) from a whole number: the same scenery wherever it is drawn. */
export const hash = (n: number) => (Math.imul(n + 1, 2654435761) >>> 0) / 4294967296

/** A filled box as path data (join several into one path to keep the markup small). */
export const box = (x: number, y: number, w: number, h: number) => `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h-${r1(w)}z`

/** A path of one color. */
export const fill = (color: string, d: string, extra = '') => (d ? `<path d="${d}" fill="${color}"${extra}/>` : '')

/** Pixel art, one letter a color: a run of pixels is one stroke and each color one path, so a frame stays small. */
export const stamp = (x: number, y: number, rows: string[], map: Record<string, string>): string => {
  const paths: Record<string, string> = {}
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; ) {
      const ch = row[dx] ?? '.'
      let len = 1
      while (row[dx + len] === ch) len++
      if (map[ch]) paths[ch] = `${paths[ch] ?? ''}M${x + dx} ${y + dy}h${len}v1h-${len}z`
      dx += len
    }
  })

  return Object.entries(paths)
    .map(([ch, d]) => `<path d="${d}" fill="${map[ch]}"/>`)
    .join('')
}

/** A filled disc, a row of pixels at a time (a pixel-art circle). */
export const disc = (cx: number, cy: number, r: number): string => {
  let d = ''
  for (let dy = -Math.floor(r); dy <= Math.floor(r); dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.35)
    d += box(cx - half, cy + dy, half * 2, 1)
  }

  return d
}
