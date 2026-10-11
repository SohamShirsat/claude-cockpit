# Technical notes

How the mod works inside. The README is the friendly version; this is for people who want to change the code.

## Where things draw

| surface | drawing | file |
| --- | --- | --- |
| desktop | a vector scene (SVG) as wide as the band: a *plan* of the next 192 steps, animated by the display (SMIL), redrawn only when the plan changes; the picture alone (the first game of a session says its keys in the picture's message strip); the ▼ duck / ▲ jump buttons are hidden but armed | `hooks/crab/scene.ts`, `hooks/register.tsx` |
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
| run speed | 5 → 8.6 units/tick (`5 + score/220`, capped at about score 800) | 1 col/tick, 2 after 200 points |
| jump | 17 ticks, 30 units high, smooth parabola; a jump pressed in the last 6 ticks of the last one is kept | 13 ticks, 3 pixels high |
| duck | 16 ticks, crab 11 units tall instead of 24; in the air a dive: the arc runs at double speed | none (the key jumps) |
| obstacles | ladybug 12×9, beetle 12×13 (40), moth 14×9 flying 11 up (70), twin bugs 27×9 (120), pit 26–42 wide (180), tall stack 12×24 (300) | ladybug 1–2×2, beetle 1×3 |
| hit-box | crab body 10 wide; an obstacle trimmed 2 each side (legs and feelers are safe); vertical overlap beyond 2 units; a pit takes a crab on the ground whose middle is over it | crab body 3 wide |
| stomp | falling, feet crossing the top of a bug: it is fixed (+10 × chain, ×2 for beetle and twin), the crab bounces (continues the arc from 3 units above it) | none |
| clouds | 16×8, 34–48 units above ground; reach: the crab lifts to meet it | 4×1, top row |
| shield orb | 10×10, 24–35 up, from ~13 s and every 11–21 s while there is none; absorbs one hit (30 ticks of grace) | none |
| score | 0.6 / tick + 25 per cloud + 10 per bug fixed (× chain) | 1 / tick + 25 per cloud |
| spacing | the gap to the next obstacle leaves room for a whole jump (+2 ticks) at the speed the run will have when it arrives, plus the obstacle's width and 0–13 random ticks | same, +4 ticks, sized the same way |
| gauntlets | set pieces (`hooks/crab/gauntlet.ts`), chance `(score-60)/2000` up to 45% | none |

## The journey and the worlds

- **Stages** (`hooks/crab/stages.ts`): a table of `{ costume, name, at }`, eight long, and `stageAt(score)` which counts stages through the laps (a lap is 3600 points; stages are 450 points, about 30 s, apart). `step` compares the new score to the game's `stage` and, in `auto` mode only, swaps `costume`, adds 25 points, starts the title (`stageAge`, 90 ticks) and pops a sparkle. Difficulty reads only the score.
- **Themes** (`hooks/crab/themes.ts`, drawers in `hooks/crab/theme-art.ts`): a world per costume, as data (sky bands, ink colors, far layers `{k, draw}`, ground `{fill, line, draw}`, `fx`, and `lane`, the colors the tests check). A drawer is pure: world range in, markup out, hung on a fixed grid (`each`, or `tiled`) so a new picture never moves anything. Meadow keeps the original look and its adaptive light/dark CSS; every other world sets colors in the markup.
- **In the picture** (`hooks/crab/scene.ts`): `worldsOf(states)` finds the worlds a plan passes through (plus the one a plan starts out of, mid-fade, from `stageAge`). Each is drawn once, shown for its ticks, the newest at the bottom and the older one fading over it (12 ticks). The crab is drawn once per costume in the plan, each shown for its own ticks. Text takes the world's ink (`ink`: a group `fill` animated by tick). The title is a text with a stepped opacity.
- **Cost**: far layers scroll as one `animateTransform` sampled every 24 ticks (their motion is linear), movers every 8; repeating scenery is an SVG `<pattern>` tile (`tiled`): constant size; weather and other loops (`class="fx"`) repeat by themselves and are hidden by `prefers-reduced-motion`. Anything that animates stays outside a tile. A plan across a stage change is about 80–90 KB.
- **Fairness** (`hooks/crab/pilot.ts`, `slack`): a brute-force search over plans of one or two moves; a plan counts when it still works with every press up to N ticks early or late. The tests require 2 ticks (80 ms) for every obstacle and gauntlet at every speed and pit width, and make sure the solver can say no.
- **Terminal** (`hooks/crab/ambient.ts`, `hooks/runner.tsx`): stage costumes (shared rules), `termHeader`, a ground line color per world, a few dim pixels of rain, stars or speed lines.

## Keys: how they reach the game

The prompt box owns the keyboard, and a plugin drawing surface only gets keys while it holds the focus. Routes:

0. **Desktop band buttons** (`hooks/register.tsx`, `sceneView`): no key field and no row. The ▼ duck / ▲ jump `Button`s (`hotkey` `j` / `k`) are ALWAYS in the tree, in a `keys-hidden` Box (absolute, 0x0, `overflow=hidden`, at the picture's corner, wholly inside the band: a Button scrolled out of the window is not armed, and a visible hotkey is drawn as a chip). After a click on Play the band holds the focus and a hotkey is the only way a letter reaches the game (the trace shows `via=button`). The session's first game (`deskQuiet`, `S.runs`, reset at `session.start`, not stored) says the keys in the picture's own message strip: `stripOf` in `scene.ts` swaps the ready text for `FIRST_GAME_READY` and a note for its `FIRST_GAME_NOTES` entry when `Plan.hints` is set (`hints = !deskQuiet(S.runs)` at `replan`), so the band is the same size in every game and nothing is drawn under HI. The score, clouds, fixes, best and GAME OVER are in the picture too.
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
hooks/crab/stages.ts          the journey: stages, thresholds, titles
hooks/crab/gauntlet.ts        set pieces and how often they come
hooks/crab/themes.ts          the world of each costume (data)
hooks/crab/theme-art.ts       the scenery drawers (pure, on a fixed grid, patterns for repeats)
hooks/crab/pix.ts             small pixel-art helpers
hooks/crab/ambient.ts         what the terminal keeps of a world
hooks/crab/scene.ts           desktop SVG scene: a plan as animation (worlds, crab, bugs, moths, pits, clouds, scoreboard in the top right corner, and a top-row strip for notes and GAME OVER that drops to the middle on a field too narrow for it)
hooks/crab/pilot.ts           a test player and the fairness solver (for the tests and previews only)
hooks/crab/master.ts, mini.ts full-size and game-size crab sprites
hooks/*.test.ts(x)            145 tests
assets/crab/                  the crab as SVG / PNG / JSON (see its README)
scripts/                      asset builder, scene preview, docs-image builder
docs/                         the images in this README
types/index.d.ts              the plugin's state contract
```
