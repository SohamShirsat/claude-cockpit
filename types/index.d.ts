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

declare module 'claude-code' {
  interface PluginState {
    'status-band': {
      usage: Usage | null
      cache: Cache | null
      handoff: HandoffPhase
      best: number
      gameOpen: boolean
    }
  }
}
