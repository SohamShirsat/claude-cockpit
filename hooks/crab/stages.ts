// The journey: as the score climbs the crab changes costume and the world changes with it. This
// file is the one place that says when, and what each stage is called. Pure data, no `$`.
//
// A stage is a costume and the theme that goes with it (themes.ts is keyed by costume, so a crab
// that is pinned to one costume keeps that costume's world and never travels). How hard the game is
// depends on the score alone, never on the stage.

import type { CostumeId } from '../../types'

export type Stage = {
  costume: CostumeId
  /** shown under the score when the stage begins */
  name: string
  /** the score the stage begins at, within a lap */
  at: number
}

// A stage should last long enough to enjoy: about 450 points, which is half a minute on the desktop
// (0.6 a tick, 25 ticks a second, plus the clouds caught) and about as long in the terminal. How
// hard the game is depends on the score, not on this table, so spacing the stages out never
// changes the difficulty curve.
export const STAGES: readonly Stage[] = [
  { costume: 'plain', name: 'MEADOW', at: 0 },
  { costume: 'swimmer', name: 'BEACH', at: 450 },
  { costume: 'chef', name: 'KITCHEN', at: 900 },
  { costume: 'racer', name: 'SPEEDWAY', at: 1350 },
  { costume: 'engineer', name: 'BUILD SITE', at: 1800 },
  { costume: 'detective', name: 'RAINY CITY', at: 2250 },
  { costume: 'pirate', name: 'STORM AT SEA', at: 2700 },
  { costume: 'astronaut', name: 'MOON', at: 3150 },
]

/** The score a whole lap of the journey spans: after it the stages come round again, from the first. */
export const LAP = 3600

/** The points a new stage is worth. */
export const STAGE_BONUS = 25

/** How many ticks a stage's title stays up (about 3.6 s on the desktop). */
export const STAGE_TICKS = 90

/**
 * How many stages the score has reached: 0 at the start, one more at each threshold, and it keeps
 * counting through the laps (stage 8 is the second lap's first). `STAGES[n % STAGES.length]` is stage n.
 */
export const stageAt = (score: number): number => {
  const lap = Math.floor(Math.max(0, score) / LAP)
  const within = Math.max(0, score) - lap * LAP
  let index = 0
  STAGES.forEach((s, i) => {
    if (within >= s.at) index = i
  })

  return lap * STAGES.length + index
}

export const stageOf = (n: number): Stage =>
  STAGES[((n % STAGES.length) + STAGES.length) % STAGES.length] ?? { costume: 'plain', name: 'MEADOW', at: 0 }
