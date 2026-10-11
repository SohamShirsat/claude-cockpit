// Gauntlets: a few obstacles that come as one set piece instead of one at a time. Each is a small
// puzzle with more than one answer (a long jump over all of it, or a stomp chain across it), and
// each is checked against a brute-force solver in the tests at every speed the run reaches, so a
// gauntlet can be hard but never unfair. Pure data, no `$`.

import type { Kind } from '../../types'

export type Piece = {
  kind: Kind
  /** units of free ground between the previous piece's right edge and this one's left edge (0 for the first) */
  after: number
}

export type Gauntlet = {
  id: string
  /** the score it first comes at: each of its pieces must already be unlocked */
  unlock: number
  pieces: readonly Piece[]
}

export const GAUNTLETS: readonly Gauntlet[] = [
  // a small bug then a beetle: jump both at once, or land on the first and bounce onto the second
  { id: 'staircase', unlock: 60, pieces: [{ kind: 'bug', after: 0 }, { kind: 'beetle', after: 26 }] },
  // a moth, then a bug: duck, then hop; or one high jump over both
  { id: 'duck-hop', unlock: 90, pieces: [{ kind: 'moth', after: 0 }, { kind: 'bug', after: 38 }] },
  // a segfault with a bug waiting on the far side: one long jump, or land on the bug
  { id: 'pit-bug', unlock: 190, pieces: [{ kind: 'pit', after: 0 }, { kind: 'bug', after: 24 }] },
  // three bugs in a row: one long jump, or stomp them one after another for the chain
  { id: 'triple', unlock: 120, pieces: [{ kind: 'bug', after: 0 }, { kind: 'bug', after: 24 }, { kind: 'bug', after: 24 }] },
]

/** The chance, from the score, that the next obstacle is a gauntlet: none early on, up to about half. */
export const gauntletChance = (score: number): number => Math.min(0.45, Math.max(0, (score - 60) / 2000))
