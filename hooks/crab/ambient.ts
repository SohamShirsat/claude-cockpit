// What the terminal keeps of a world: a few dim pixels behind the play (rain, stars, speed lines) and the
// color of the ground line. Pure and cheap: each is a rule of column, row and tick, nothing stored.

import type { CostumeId } from '../../types'

export type Ambient = {
  color: string
  /** whether the pixel at this column and row (0 at the top) is lit on this tick */
  on: (col: number, row: number, tick: number) => boolean
}

export const AMBIENT: Partial<Record<CostumeId, Ambient>> = {
  detective: { color: '#5F7396', on: (c, r, t) => (c * 4 + r + t) % 13 === 0 },
  pirate: { color: '#5E8294', on: (c, r, t) => (c * 4 + r + t * 2) % 9 === 0 },
  astronaut: { color: '#8E97C2', on: (c, r, t) => r < 5 && (c * 11 + r * 17) % 23 === 0 && (t + c) % 7 !== 0 },
  racer: { color: '#7C8798', on: (c, r, t) => (r === 3 && (c + t * 2) % 12 < 4) || (r === 6 && (c + t * 3) % 17 < 5) },
}

/** The ground line's color in a world (null: the terminal's own dim). */
export const GROUND: Partial<Record<CostumeId, string>> = {
  swimmer: '#D6BC84',
  chef: '#A7835D',
  racer: '#B4B7BF',
  engineer: '#C9A93A',
  detective: '#47536F',
  pirate: '#A88557',
  astronaut: '#8E91A6',
}
