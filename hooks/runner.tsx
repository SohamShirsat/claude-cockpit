import type { ClientModule } from 'claude-code'

import type { CostumeId } from './crab/master'
import { ARC, HIT, miniFrame, toCells, toRuns } from './crab/mini'
import type { Frame, Px } from './crab/mini'

// "Claude runner": a one-button dodge game drawn on the drawing thread, opened
// from the band's play control. No model calls and no tokens. The frame timer
// only redraws while a run is live, so a finished or waiting game costs nothing.
// The runner is the Claude crab (hooks/crab), drawn in half-block pixels; the field is a pixel
// grid, two pixels to a cell row.

type Mode = 'ready' | 'play' | 'over'
type Obstacle = { x: number; w: number; h: number }
type St = {
  mode: Mode
  cols: number
  /** pixels the crab is off the ground */
  y: number
  jump: number
  obs: Obstacle[]
  score: number
  best: number
  seed: number
  since: number
  wait: number
  off: number
  costume: CostumeId
  /** the costume changes with every new run */
  auto: boolean
  run: number
}
type Props = { best?: number; cols?: number; costume?: string; start?: number } | null

const TICK_MS = 100
const PX = 2 // the crab's left column
const FIELD_PX = 10 // field height in pixels: the tallest crab (7) plus the top of a jump (3)
const ROCK = '#C85A54'
const ROCK_TOP = '#E0736B'
const ROTATION: readonly CostumeId[] = ['plain', 'astronaut', 'detective', 'engineer', 'chef', 'racer', 'pirate']
const JUMP_KEYS = new Set([' ', 'space', 'up', 'w', 'k', 'return'])

const rand = (seed: number) => (seed * 16807) % 2147483647

const costumeFor = (setting: string | undefined): { id: CostumeId | null } => ({
  id: ROTATION.find(c => c === setting) ?? null,
})

const fresh = (best: number, cols: number, seed: number, mode: Mode, look: Pick<St, 'costume' | 'auto' | 'run'>): St => ({
  ...look,
  mode,
  cols,
  y: 0,
  jump: -1,
  obs: [],
  score: 0,
  best,
  seed,
  since: 0,
  wait: 12,
  off: 0,
})

const step = (s: St): St => {
  let { jump, seed, since, wait, off } = s
  let y = 0
  if (jump >= 0) {
    y = ARC[jump] ?? 0
    jump = jump + 1 < ARC.length ? jump + 1 : -1
  }

  const speed = s.score >= 150 ? 2 : 1
  let obs = s.obs
  let dead = false
  for (let k = 0; k < speed && !dead; k++) {
    obs = obs.map(o => ({ ...o, x: o.x - 1 })).filter(o => o.x + o.w > 0)
    dead = obs.some(o => PX + HIT.to >= o.x && PX + HIT.from < o.x + o.w && y < o.h)
  }
  off += speed
  since += 1

  if (!dead && since >= wait) {
    seed = rand(seed)
    const tall = s.score >= 60 && seed % 3 === 0
    seed = rand(seed)
    const w = tall ? 1 : 1 + (seed % 2)
    seed = rand(seed)
    obs = [...obs, { x: s.cols - 1, w, h: tall ? 3 : 2 }]
    since = 0
    wait = 14 + (seed % 10)
  }

  const next = { ...s, y, jump, obs, seed, since, wait, off }
  if (dead) return { ...next, mode: 'over', best: Math.max(s.best, s.score) }
  return { ...next, score: s.score + 1 }
}

const act = (s: St): St => {
  if (s.mode === 'ready') return fresh(s.best, s.cols, s.seed, 'play', s)
  if (s.mode === 'over') {
    const run = s.auto ? s.run + 1 : s.run

    return fresh(s.best, s.cols, s.seed, 'play', { ...s, run, costume: s.auto ? (ROTATION[run % ROTATION.length] ?? s.costume) : s.costume })
  }
  if (s.mode === 'play' && s.jump < 0) return { ...s, jump: 0 }
  return s
}

// The field as pixels, top row first: the rocks, then the crab on top of them.
const field = (s: St): Frame => {
  const px: Frame = Array.from({ length: FIELD_PX }, () => Array<Px>(s.cols).fill(null))
  for (const o of s.obs) {
    for (let c = Math.max(0, o.x); c < Math.min(s.cols, o.x + o.w); c++) {
      for (let k = 0; k < o.h; k++) {
        const row = px[FIELD_PX - 1 - k]
        if (row) row[c] = k === o.h - 1 ? ROCK_TOP : ROCK
      }
    }
  }
  const step = s.mode === 'play' ? ((Math.floor(s.score / 3) % 2) as 0 | 1) : 0
  const sprite = miniFrame(s.costume, step, s.mode === 'play' && s.y > 0, s.mode === 'over')
  const bottom = FIELD_PX - 1 - s.y
  sprite.forEach((line, r) => {
    const row = px[bottom - (sprite.length - 1 - r)]
    if (!row) return
    line.forEach((color, c) => {
      if (color && PX + c < s.cols) row[PX + c] = color
    })
  })

  return px
}

const ground = (s: St): string => Array.from({ length: s.cols }, (_, c) => ((c + s.off) % 8 === 0 ? '┄' : '─')).join('')

const pad = (t: string, n: number) => (t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length))
const num = (n: number) => String(n).padStart(4, '0')

const header = (s: St) => {
  if (s.mode === 'play') return ` score ${num(s.score)} · best ${num(s.best)} · space / ↑ / click to jump`
  if (s.mode === 'over') return ` game over ${num(s.score)} · best ${num(s.best)} · space retry · q close`
  return ` ${s.costume} · best ${num(s.best)} · space / ↑ / click to start · q close`
}

const Runner: ClientModule<Props, St> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    const cols = Math.max(20, Math.min(props?.cols ?? 40, 60))
    surface.every(TICK_MS, () => {
      const s = surface.state
      if (!s || s.mode !== 'play') return
      const next = step(s)
      surface.setState(next)
      if (next.mode === 'over') surface.post({ best: next.best })
    })
    surface.onKey(ev => {
      const s = surface.state
      if (!s) return
      // q hands the close to the hooks module, which owns whether the game is open
      if (ev.key === 'q') surface.post({ close: true })
      else if (JUMP_KEYS.has(ev.key)) surface.setState(act(s))
    })
    surface.onPointer(ev => {
      const s = surface.state
      if (!s || ev.type !== 'down') return
      surface.setState(act(s))
    })
    const { id } = costumeFor(props?.costume)
    const run = Math.max(0, Math.floor(props?.start ?? 0))
    const costume = id ?? ROTATION[run % ROTATION.length] ?? 'plain'
    surface.setState(fresh(Math.max(0, Math.floor(props?.best ?? 0)), cols, 7, 'ready', { costume, auto: id === null, run }))
  }

  const s = surface.state
  if (!s) return <Box height={0} />

  const rows = toCells(field(s))
  return (
    <Box flexDirection="column" width={s.cols}>
      <Box>
        <Text color="claude" bold>
          ✻
        </Text>
        <Text dimColor>{pad(header(s), s.cols - 1)}</Text>
      </Box>
      {rows.map((cells, r) => (
        <Box key={`r${r}`}>
          {toRuns(cells).map((run, i) => (
            <Text key={`c${i}`} color={run.fg} backgroundColor={run.bg}>
              {run.text}
            </Text>
          ))}
        </Box>
      ))}
      <Text dimColor>{ground(s)}</Text>
    </Box>
  )
}

export default Runner
