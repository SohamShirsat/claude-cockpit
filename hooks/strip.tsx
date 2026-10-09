import type { ClientModule } from 'claude-code'

// The desktop game is a picture, and a picture takes no keys: this one line above it does. It is
// the game's only line of guidance (score, and the keys to press); a click on it jumps and gives
// it the keyboard, so space / ↑ / k jump too and q closes the game. The hooks module owns the game
// itself; the line only says what was pressed.

type Props = { text?: string } | null

const JUMP_KEYS = new Set([' ', 'space', 'up', 'w', 'k', 'return'])

const Strip: ClientModule<Props, boolean> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.onKey(ev => {
      if (ev.key === 'q') surface.post({ close: true })
      else if (JUMP_KEYS.has(ev.key)) surface.post({ jump: true, via: ev.key })
    })
    surface.onPointer(ev => {
      if (ev.type === 'down') surface.post({ jump: true, via: 'click' })
    })
    surface.setState(true)
  }

  return (
    <Box>
      <Text color="claude" bold>
        ✻
      </Text>
      <Text dimColor>{props?.text ?? ''}</Text>
    </Box>
  )
}

export default Strip
