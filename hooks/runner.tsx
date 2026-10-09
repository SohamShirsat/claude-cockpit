import type { ClientModule } from 'claude-code'

// "Claude runner": a one-button dodge game drawn on the drawing thread, opened
// from the band's play control. No model calls and no tokens. The frame timer
// only redraws while a run is live, so a finished or waiting game costs nothing.

type Mode = 'ready' | 'play' | 'over'
type Obstacle = { x: number; w: number; h: number }
type St = {
  mode: Mode
  cols: number
  y: number
  jump: number
  obs: Obstacle[]
  score: number
  best: number
  seed: number
  since: number
  wait: number
  off: number
}
type Props = { best?: number; cols?: number } | null

const TICK_MS = 100
const PX = 4 // the runner's column
const ARC = [1, 2, 2, 2, 2, 1] // height per tick of a jump
const JUMP_KEYS = new Set([' ', 'space', 'up', 'w', 'k', 'return'])

const rand = (seed: number) => (seed * 16807) % 2147483647

const fresh = (best: number, cols: number, seed: number, mode: Mode): St => ({
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
    dead = obs.some(o => PX >= o.x && PX < o.x + o.w && y < o.h)
  }
  off += speed
  since += 1

  if (!dead && since >= wait) {
    seed = rand(seed)
    const tall = s.score >= 60 && seed % 3 === 0
    seed = rand(seed)
    const w = 1 + (seed % 2)
    seed = rand(seed)
    obs = [...obs, { x: s.cols - 1, w, h: tall ? 2 : 1 }]
    since = 0
    wait = 14 + (seed % 10)
  }

  const next = { ...s, y, jump, obs, seed, since, wait, off }
  if (dead) return { ...next, mode: 'over', best: Math.max(s.best, s.score) }
  return { ...next, score: s.score + 1 }
}

const act = (s: St): St => {
  if (s.mode === 'ready' || s.mode === 'over') return fresh(s.best, s.cols, s.seed, 'play')
  if (s.mode === 'play' && s.jump < 0) return { ...s, jump: 0 }
  return s
}

// field rows top to bottom: height 2, height 1, ground level, ground line
const field = (s: St): string[][] => {
  const rows = [0, 1, 2].map(() => Array<string>(s.cols).fill(' '))
  for (const o of s.obs) {
    for (let c = Math.max(0, o.x); c < Math.min(s.cols, o.x + o.w); c++) {
      if (o.h > 1) {
        rows[1]![c] = 'a'
        rows[2]![c] = 'b'
      } else {
        rows[2]![c] = 'a'
      }
    }
  }
  rows[2 - s.y]![PX] = s.mode === 'over' ? 'D' : 'P'
  const ground = Array.from({ length: s.cols }, (_, c) => ((c + s.off) % 8 === 0 ? 'd' : 'g'))
  return [...rows, ground]
}

const GLYPH: Record<string, string> = { P: '✻', D: '✕', a: '▲', b: '█', g: '─', d: '┄', ' ': ' ' }

const pad = (t: string, n: number) => (t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length))
const num = (n: number) => String(n).padStart(4, '0')

const header = (s: St) => {
  if (s.mode === 'play') return ` score ${num(s.score)} · best ${num(s.best)} · space / ↑ / click to jump`
  if (s.mode === 'over') return ` game over ${num(s.score)} · best ${num(s.best)} · space retry · q close`
  return ` run · best ${num(s.best)} · space / ↑ / click to start · q close`
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
    surface.setState(fresh(Math.max(0, Math.floor(props?.best ?? 0)), cols, 7, 'ready'))
  }

  const s = surface.state
  if (!s) return <Box height={0} />

  const lines = field(s)
  return (
    <Box flexDirection="column" width={s.cols}>
      <Box>
        <Text color="claude" bold>
          ✻
        </Text>
        <Text dimColor>{pad(header(s), s.cols - 1)}</Text>
      </Box>
      {lines.map((line, r) => {
        const runs: { code: string; len: number }[] = []
        for (const code of line) {
          const last = runs[runs.length - 1]
          if (last && last.code === code) last.len += 1
          else runs.push({ code, len: 1 })
        }
        return (
          <Box key={`r${r}`}>
            {runs.map((run, i) => {
              const text = (GLYPH[run.code] ?? ' ').repeat(run.len)
              if (run.code === 'P') return <Text key={`c${i}`} color="claude" bold>{text}</Text>
              if (run.code === 'D' || run.code === 'a' || run.code === 'b') return <Text key={`c${i}`} color="error">{text}</Text>
              if (run.code === 'g' || run.code === 'd') return <Text key={`c${i}`} dimColor>{text}</Text>
              return <Text key={`c${i}`}>{text}</Text>
            })}
          </Box>
        )
      })}
    </Box>
  )
}

export default Runner
