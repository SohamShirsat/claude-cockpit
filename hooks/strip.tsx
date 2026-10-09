import type { ClientModule } from 'claude-code'

// The desktop game is a picture, and a picture takes no keys: this one-row strip under it does.
// A click on it jumps and gives it the keyboard, so space / ↑ jump too and q closes the game.
// The hooks module owns the game itself; the strip only says what was pressed.

type Props = { mode?: string } | null

const JUMP_KEYS = new Set([' ', 'space', 'up', 'w', 'k', 'return'])

const LABEL: Record<string, string> = {
  ready: 'space / ↑ with an empty prompt box, k, or click here · q close',
  play: 'space / ↑ with an empty prompt box, k, or click here',
  over: 'game over · space to retry, or click here · q close',
}

const Strip: ClientModule<Props, boolean> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.onKey(ev => {
      if (ev.key === 'q') surface.post({ close: true })
      else if (JUMP_KEYS.has(ev.key)) surface.post({ jump: true })
    })
    surface.onPointer(ev => {
      if (ev.type === 'down') surface.post({ jump: true })
    })
    surface.setState(true)
  }

  return (
    <Box>
      <Text color="claude" bold>
        ↑
      </Text>
      <Text dimColor> {LABEL[props?.mode ?? 'ready'] ?? LABEL.ready}</Text>
    </Box>
  )
}

export default Strip
