# Claude crab sprites

The pixel Claude crab ("Clawd") with all seven costumes, saved from
[johnnyvizz/claude-kit](https://github.com/JohnnyVizz/claude-kit) (`plugins/savvy-progress`, MIT,
see `LICENSE-upstream`), which traces DockCrab's Clawdy. Open `sheet.html` to see them move.

| costume | tier | what moves |
| --- | --- | --- |
| plain | other | the walk |
| astronaut | fable | floats; antenna and star blink |
| detective | heavy | the magnifier sweeps and glints |
| engineer | careful | the wrench turns a bolt |
| chef | medium | tosses the omelette |
| racer | light | runs at double pace; the flag flutters |
| pirate | explore | the cutlass fences |

## Files

| path | what |
| --- | --- |
| `svg/<id>.svg` | animated, standalone; pure CSS, no script. Use as `<img>` or inline |
| `svg/<id>.still.svg` | the same without motion |
| `png/<id>.png` | 480x448, transparent, idle pose |
| `png/<id>.mini.png` | the game-size crab: walk, walk, jump, game over |
| `sprites.json` | every pixel: full-size `layers` as `[x, y, w, h, color]` rects on a 30x28 grid, painted in `paintOrder` (`bd`, props, `la`, `lb`), and the 9px-wide `mini` frames |
| `sheet.html` | preview of all of the above |

## Using them

- **In this mod:** `hooks/crab/master.ts` is the source of truth (`layers(id)`, `toSvg(id)`);
  `hooks/crab/mini.ts` holds the game-size sprites (`miniFrame(id, step, air, dead)`) and the
  half-block drawing (`toCells`, `toRuns`). The runner in `hooks/runner.tsx` is built on them.
- **The game scene:** `hooks/crab/scene.ts` (`sceneSvg(game, config, size)`, `crabGroup(id, tick, air, running)`) draws a posed, animated crab on the ground with stones and cacti; `hooks/crab/game.ts` has the rules.
- **A new animation or game:** import `miniFrame` and draw its pixels two to a cell, or take
  `sprites.json` into anything that draws rectangles.
- **Regenerate** after editing a sprite: `node --import ./scripts/ts-loader.mjs scripts/build-assets.ts`

The costume the game uses is the `costume` setting: `auto` (a new one every run) or one by name.
