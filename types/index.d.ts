export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Usage = {
  ctxPercent?: number
  ctxTokens?: number
  ctxWindow: number
  limits: Limit[]
  cost?: number
}

export type HandoffPhase = 'idle' | 'confirm' | 'running'

export type Cache = { hitPercent: number; readTokens: number; at: number }

export type Repo = {
  root: string
  name: string
  branch: string
  isWorktree: boolean
  worktree: string
  dirty: number
}

export type CostumeId = 'plain' | 'astronaut' | 'detective' | 'engineer' | 'chef' | 'racer' | 'pirate'

export type GameMode = 'ready' | 'play' | 'over'

/** What comes at the crab: bugs to jump or stomp, a moth to duck, twin bugs, a pit to jump over. */
export type Kind = 'bug' | 'beetle' | 'moth' | 'twin' | 'pit'

/**
 * Something coming at the crab: `x` its left edge, `w` and `h` its size, `base` how far its underside is
 * above the ground (a moth flies), in game units. `tall` is the big beetle (the terminal draws it so).
 */
export type Obstacle = { id: number; x: number; w: number; h: number; base: number; tall: boolean; kind: Kind }

/** A cloud in the air to grab (or the green shield orb): `x` its left edge, `h` how far its underside is above the ground. */
export type Cloud = { id: number; x: number; w: number; h: number; t?: number; shield?: boolean }

/** A burst where something happened: a sparkle, a puff of dust, or a few floating words; `age` in ticks since. */
export type Pop = { id: number; x: number; h: number; age: number; kind: 'spark' | 'poof' | 'text'; text?: string }

/** One run of the crab game. Plain data: the same rules drive the terminal and the desktop. */
export type Game = {
  mode: GameMode
  /** frames played this run: drives every animation */
  tick: number
  /** how high the crab is off the ground */
  y: number
  /** index into the jump arc, -1 on the ground */
  jump: number
  /** a dive: pressed down in the air, the crab drops twice as fast */
  dive: boolean
  /** ticks of duck left (the crab is low enough to pass under a moth), 0 when standing */
  duck: number
  /** a press just before landing: the next jump starts the moment the crab lands */
  queued: boolean
  obs: Obstacle[]
  clouds: Cloud[]
  pops: Pop[]
  /** next id for anything that has to be followed from one tick to the next */
  nid: number
  /** clouds grabbed this run */
  grabbed: number
  /** bugs fixed (stomped, or blasted by the shield) this run */
  fixed: number
  /** stomps since the crab last touched the ground */
  combo: number
  /** the shield: the next hit is absorbed */
  shield: boolean
  /** ticks of grace left after the shield was spent */
  inv: number
  /** kinds met so far this run: the first of each is announced */
  seen: string[]
  /** the announcement on screen, and how many ticks old it is (-1 when none) */
  note: string
  noteAge: number
  /** what ended the run */
  cause: '' | 'hit' | 'pit'
  /** the score runs on fractions of a point per tick; show it rounded down */
  score: number
  best: number
  seed: number
  /** ticks since the last obstacle came in, and how many until the next one */
  since: number
  gap: number
  /** the same for the next cloud and the next shield orb */
  sinceCloud: number
  cloudGap: number
  sinceOrb: number
  orbGap: number
  /** ground scroll */
  off: number
  costume: CostumeId
  /** the costume changes with every new run */
  auto: boolean
  run: number
}

/** What the band draws of the desktop's run: the game now (for the guidance line) and the picture (a plan, see scene.ts). */
export type RunView = { game: Game; svg: string; units: number; seq: number }

declare module 'claude-code' {
  interface PluginState {
    'status-band': {
      usage: Usage | null
      cache: Cache | null
      handoff: HandoffPhase
      best: number
      gameOpen: boolean
      game: RunView | null
      jumpSignal: number
    }
  }
}
