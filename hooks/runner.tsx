import type { ClientModule } from 'claude-code'

import { act, fresh, header, lookFor, step, termConfig } from './crab/game'
import type { Config, Game } from './crab/game'
import { miniFrame, toCells, toRuns } from './crab/mini'
import type { Frame, Px } from './crab/mini'

// "Claude runner" for the terminal: the crab game drawn in half-block pixels, two to a cell, on
// the drawing thread. Opened from the band's play control. No model calls and no tokens, and the
// frame timer only redraws while a run is live. (The desktop draws a vector scene instead: its
// proportional font cannot lay block characters out as pixels. See hooks/crab/scene.ts.)

type Props = { best?: number; cols?: number; costume?: string; start?: number; signal?: number } | null
type St = { game: Game; cfg: Config; signal: number }

const FIELD_PX = 10 // the tallest crab (7 pixels) plus the top of a jump (3)
const BUG = '#C0392B'
const BUG_TOP = '#E8786B'
const BIG = '#3B9C5F'
const BIG_TOP = '#6CC58A'
const CLOUD = '#9CCBF2'
const JUMP_KEYS = new Set([' ', 'space', 'up', 'w', 'k', 'return'])

// The field as pixels, top row first: the clouds, the bugs, then the crab on top of them.
const field = ({ game: g, cfg }: St): Frame => {
  const px: Frame = Array.from({ length: FIELD_PX }, () => Array<Px>(cfg.width).fill(null))
  for (const o of g.clouds) {
    for (let c = Math.max(0, Math.floor(o.x)); c < Math.min(cfg.width, Math.floor(o.x) + o.w); c++) {
      for (let k = o.h; k < o.h + cfg.cloud.th; k++) {
        const row = px[FIELD_PX - 1 - k]
        if (row) row[c] = CLOUD
      }
    }
  }
  for (const o of g.obs) {
    for (let c = Math.max(0, Math.floor(o.x)); c < Math.min(cfg.width, Math.floor(o.x) + o.w); c++) {
      for (let k = 0; k < o.h; k++) {
        const row = px[FIELD_PX - 1 - k]
        if (row) row[c] = k === o.h - 1 ? (o.tall ? BIG_TOP : BUG_TOP) : o.tall ? BIG : BUG
      }
    }
  }
  const walk = g.mode === 'play' ? ((Math.floor(g.tick / 4) % 2) as 0 | 1) : 0
  const sprite = miniFrame(g.costume, walk, g.mode === 'play' && g.y > 0, g.mode === 'over')
  const bottom = FIELD_PX - 1 - Math.round(g.y)
  sprite.forEach((line, r) => {
    const row = px[bottom - (sprite.length - 1 - r)]
    if (!row) return
    line.forEach((color, c) => {
      if (color && cfg.crabX + c < cfg.width) row[cfg.crabX + c] = color
    })
  })

  return px
}

const ground = ({ game: g, cfg }: St): string =>
  Array.from({ length: cfg.width }, (_, c) => ((c + Math.floor(g.off)) % 8 === 0 ? '┄' : '─')).join('')

const pad = (t: string, n: number) => (t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length))

const Runner: ClientModule<Props, St> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    const cols = Math.max(20, Math.min(props?.cols ?? 40, 60))
    const cfg = termConfig(cols)
    surface.every(cfg.tickMs, () => {
      const s = surface.state
      if (!s || s.game.mode !== 'play') return
      const game = step(s.game, s.cfg)
      surface.setState({ ...s, game })
      if (game.mode === 'over') surface.post({ best: game.best })
    })
    const press = () => {
      const s = surface.state
      if (s) surface.setState({ ...s, game: act(s.game, s.cfg) })
    }
    surface.onKey(ev => {
      // q hands the close to the hooks module, which owns whether the game is open
      if (ev.key === 'q') surface.post({ close: true })
      else if (JUMP_KEYS.has(ev.key)) press()
    })
    surface.onPointer(ev => {
      if (ev.type === 'down') press()
    })
    const best = Math.max(0, Math.floor(props?.best ?? 0))
    surface.setState({ cfg, signal: props?.signal ?? 0, game: fresh(best, 7, 'ready', lookFor(props?.costume, props?.start ?? 0), cfg) })
  }

  const s = surface.state
  if (!s) return <Box height={0} />

  // the hooks module reads Space / ↑ at the prompt box and says so by changing `signal`
  const signal = props?.signal ?? 0
  if (signal !== s.signal) {
    surface.setState({ ...s, signal, game: act(s.game, s.cfg) })
    return <Box height={0} />
  }

  const rows = toCells(field(s))
  return (
    <Box flexDirection="column" width={s.cfg.width}>
      <Box>
        <Text color="claude" bold>
          ✻
        </Text>
        <Text dimColor>{pad(header(s.game), s.cfg.width - 1)}</Text>
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
