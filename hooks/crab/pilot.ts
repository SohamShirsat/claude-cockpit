// A player that sees what is coming: for the tests and the preview pages, never loaded by the band.
// It centres each jump on what it clears, ducks under moths, and can aim to land on bugs instead.

import { act } from './game'
import type { Config, Game } from './game'

export type Style = {
  /** land on the bugs (a stomp) instead of jumping clear over them */
  stomp?: boolean
}

/** The tick of a jump at which the crab, coming down, is level with `top`. */
const fallsTo = (cfg: Config, top: number): number => {
  const apex = cfg.arc.indexOf(Math.max(...cfg.arc))
  for (let i = apex; i < cfg.arc.length; i++) if ((cfg.arc[i] ?? 0) <= top) return i

  return cfg.arc.length - 1
}

export const pilot = (g: Game, cfg: Config, style: Style = {}): Game => {
  if (g.mode !== 'play') return g
  const speed = cfg.speed(g.score)
  const centre = cfg.crabX + (cfg.hit[0] + cfg.hit[1]) / 2
  const o = g.obs.find(b => b.x + b.w > cfg.crabX + cfg.hit[0] - 1)
  if (!o) return g
  // ticks until the middle of it is over the middle of the crab
  const eta = (o.x + o.w / 2 - centre) / speed
  if (o.kind === 'moth' && !style.stomp) return eta <= 8 && eta > -2 && g.duck === 0 && g.jump < 0 ? act(g, cfg, 'duck') : g
  // a jump clears it with its middle over the middle; a stomp comes down on it
  const lead = style.stomp && o.kind !== 'pit' ? fallsTo(cfg, o.base + o.h) : cfg.arc.length / 2

  return eta <= lead && g.jump < 0 ? act(g, cfg) : g
}
