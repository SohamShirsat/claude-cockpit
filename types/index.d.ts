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

/** A rock or a cactus coming at the crab: `x` its left edge, `w` and `h` its size, in game units. */
export type Obstacle = { x: number; w: number; h: number; tall: boolean }

/** One run of the crab game. Plain data: the same rules drive the terminal and the desktop. */
export type Game = {
  mode: GameMode
  /** frames played this run: drives every animation */
  tick: number
  /** how high the crab is off the ground */
  y: number
  /** index into the jump arc, -1 on the ground */
  jump: number
  obs: Obstacle[]
  score: number
  best: number
  seed: number
  /** ticks since the last obstacle came in, and how many until the next one */
  since: number
  gap: number
  /** ground scroll */
  off: number
  costume: CostumeId
  /** the costume changes with every new run */
  auto: boolean
  run: number
}

declare module 'claude-code' {
  interface PluginState {
    'status-band': {
      usage: Usage | null
      cache: Cache | null
      handoff: HandoffPhase
      best: number
      gameOpen: boolean
      game: Game | null
      jumpSignal: number
    }
  }
}
