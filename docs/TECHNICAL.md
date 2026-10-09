# Technical notes

How the mod works inside. The README is the friendly version; this is for people who want to change the code.

## Where things draw

| surface | drawing | file |
| --- | --- | --- |
| desktop | a vector scene (SVG) as wide as the band: a *plan* of the next 192 steps, animated by the display (SMIL), redrawn only when the plan changes; a key field and ▼ duck / ▲ jump buttons above | `hooks/crab/scene.ts`, `hooks/register.tsx` |
| terminal | half-block pixels (two pixels per cell), 60 ms ticks | `hooks/runner.tsx`, `hooks/crab/mini.ts` |

The desktop draws text in a proportional font, which cannot lay block characters out as pixels; hence a picture there and half-blocks in a terminal. Both play the **same rules** (`hooks/crab/game.ts`), tuned twice; the terminal has the ladybug, the beetle and the clouds.

## Smooth motion (`hooks/register.tsx`, `hooks/crab/scene.ts`)

- The module owns the run (`S.run`) and keeps it to the wall clock: one step per 40 ms, owed steps made up when a call comes late, a stall of the whole app pauses the run instead of ending it (`advance`).
- `ahead(game, cfg, n)` plays the run forward with nothing pressed. `motionSvg` turns those states into markup: each moving thing is a group with an `animateTransform` whose `values` are its positions (every 2nd step for bugs and clouds, every step for the crab, every 6th for the sky layers); the crab's leg, bob and prop frames, a duck, a shield, a blink and the vanishing of a fixed bug are discrete animations on the same clock. Every animation has `begin` = minus how far into a step the picture starts, so it is right at its first moment.
- `replan` builds that picture from the moment it will be on screen (now + `LEAD_MS`), when a press changed the run, when 48 steps or fewer remain, after a stall, and at the end of a run (a still, with the crab's fall carried on from how long ago it ended). `publish` hands it to the band, once per plan. The score is drawn into the picture (a stack of digits a place, each shown while it is the digit), so nothing in the band is redrawn while a run plays; `arm` sets the one timer.
- Press, plan and trace lines: `~/.claude/status-band-trace.log`. `scripts/preview-motion.ts` writes a page that plays a plan (inline, so time can be seeked, and as an image).

## Rules (`hooks/crab/game.ts`)

One pure function, `step(game, config)`, advances a run one tick; no timers, no `$`. Callers own the clock. `act(game, config, 'jump' | 'duck')` is a press.

| | desktop | terminal |
| --- | --- | --- |
| field | 260–520 units wide (the band's width at two pixels a unit) | 30–56 columns |
| tick | 40 ms | 60 ms |
| run speed | 4 → 7.4 units/tick (`4 + score/400`, capped) | 1 col/tick, 2 after 200 points |
| jump | 17 ticks, 30 units high, smooth parabola; a jump pressed in the last 6 ticks of the last one is kept | 13 ticks, 3 pixels high |
| duck | 16 ticks, crab 11 units tall instead of 24; in the air a dive: the arc runs at double speed | none (the key jumps) |
| obstacles | ladybug 12×9, beetle 12×13 (60), moth 14×9 flying 11 up (110), twin bugs 27×9 (180), pit 26–42 wide (260) | ladybug 1–2×2, beetle 1×3 |
| hit-box | crab body 10 wide; an obstacle trimmed 2 each side (legs and feelers are safe); vertical overlap beyond 2 units; a pit takes a crab on the ground whose middle is over it | crab body 3 wide |
| stomp | falling, feet crossing the top of a bug: it is fixed (+10 × chain, ×2 for beetle and twin), the crab bounces (continues the arc from 3 units above it) | none |
| clouds | 16×8, 34–48 units above ground; reach: the crab lifts to meet it | 4×1, top row |
| shield orb | 10×10, 24–35 up, from ~13 s and every 11–21 s while there is none; absorbs one hit (30 ticks of grace) | none |
| score | 0.6 / tick + 25 per cloud + 10 per bug fixed (× chain) | 1 / tick + 25 per cloud |
| spacing | the gap between obstacles always leaves room for a whole jump even at top speed (plus the obstacle's width) | same |

## Keys: how they reach the game

The prompt box owns the keyboard, and a plugin drawing surface only gets keys while it holds the focus. Routes:

0. **Desktop key field** (`hooks/register.tsx`, `sceneView`): the guidance line is an `Input`. Play calls `$.ui.focus` on it (`focusGame`, retried); its `onInput` is every key (`j` / `s` duck, `q` closes, anything else jumps), `onSubmit` is Enter, and a `ui.focus` hook turns an arrow / Tab ring move onto the band's own controls into a press (onto ▼ duck: a duck; anywhere else: a jump) and keeps the ring on the field (`hooks/keys.ts`, `ringVerdict`: pure, tested).
1. **`prompt.edit` hook** (`hooks/register.tsx`): while the game is open and the box is empty, Space/↑ (and `k` while a run is live) are consumed there and turned into a jump, ↓ (and `j` while a run is live) into a duck. Any other key, or any non-empty draft, passes through untouched.
2. **The ▲ jump and ▼ duck buttons**, on every surface: a click, or `k` / `j` while the band holds the keyboard.

A press is applied synchronously to the module's run (`press`), after bringing it up to the wall clock, so a key and a timer tick that land together both count.

## Files

```
.claude-plugin/plugin.json    manifest, version, user settings
.claude-plugin/marketplace.json
hooks/register.tsx            the band, handoff, game control, keys, timers
hooks/runner.tsx              terminal game (Client module)
hooks/keys.ts                 what a move of the focus ring means, and the key hint (pure)
hooks/crab/game.ts            rules, configs, `ahead` (the run played forward), header text
hooks/crab/scene.ts           desktop SVG scene: a plan as animation (crab, bugs, moths, pits, clouds, sky)
hooks/crab/pilot.ts           a test player (for the tests and previews only)
hooks/crab/master.ts, mini.ts full-size and game-size crab sprites
hooks/*.test.ts(x)            110 tests
assets/crab/                  the crab as SVG / PNG / JSON (see its README)
scripts/                      asset builder, scene preview, docs-image builder
docs/                         the images in this README
types/index.d.ts              the plugin's state contract
```
