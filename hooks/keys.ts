// How the desktop game decides what a move of the focus ring means. Pure: no `$`, no clock of its own.
//
// The game's keys arrive in a native text field, and the field only gets printable keys. The arrows
// and Tab move the focus ring instead, off the field and onto the band's other controls (where a
// Space would press Play and close the game). So while the ring sits on the field, a person's move
// of it onto one of those controls is read as a key.

export type RingMove = {
  /** who moves the ring: the person (a key or a click) or this plugin's own `$.ui.focus` */
  origin: 'person' | 'plugin'
  /** the element taking the ring is one this plugin drew */
  isOwn: boolean
  /** its key; absent for one of the engine's own stops */
  element?: string
}

export type RingState = {
  /** where the ring last sat while the game was open ('' when it is not the game's) */
  ring: string
  /** when that was last confirmed (a key came through the field, or the engine put the ring there) */
  at: number
  now: number
}

export type Verdict =
  /** the ring lands on the key field: the game holds the keys */
  | 'confirm'
  /** a key: jump, and keep the ring on the field */
  | 'jump'
  /** the ring goes somewhere the game does not own: the keys are the person's again */
  | 'leave'
  /** nothing to say about it */
  | 'pass'

export type Rules = { keys: string; own: ReadonlySet<string>; ttlMs: number }

export const ringVerdict = (move: RingMove, state: RingState, rules: Rules): Verdict => {
  if (move.isOwn && move.element === rules.keys) return 'confirm'
  if (move.origin === 'plugin') return 'pass'
  const isHeld = state.ring === rules.keys && state.now - state.at < rules.ttlMs
  if (isHeld && move.isOwn && move.element !== undefined && rules.own.has(move.element)) return 'jump'

  return 'leave'
}

/** What the one line of guidance says the keys are doing. */
export const keyHint = (keys: 'wait' | 'live' | 'click', isTurnDone: boolean): string => {
  if (keys === 'click') return 'click here, then any key'
  if (isTurnDone) return 'any key · esc to type'

  return 'any key'
}
