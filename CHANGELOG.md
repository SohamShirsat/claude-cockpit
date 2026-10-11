# Changelog

What changed in each version, newest first. (The plugin's version lives in `.claude-plugin/plugin.json`.)

## 0.13.14

**Passes the Claude directory's checks.**
- The code now follows the directory's stricter reading rules: no variable named `h`, `git` is a plain function, the terminal game's `Client` comes straight from the element table.
- Dropped the `ui.fault` hook (a diagnostic toast the directory's event list does not know); a failing game surface is simply left out, as before.
- A 1024 px icon (`.claude-plugin/icon.png`).
- README: the privacy section now lists every call the mod makes, the hooks it registers, the exact `git` commands, and what Handoff does step by step.

## 0.13.13

**Ready for the Claude directory: privacy page, fresh pictures.**
- README: a new "Privacy, and what this plugin runs" section that lists everything the mod reads, writes and sends.
- The trace log no longer records the characters typed into the prompt box while the game is open; it notes only "game key" or "passed to the prompt".
- `displayName` is "Claude Cockpit" (the plugin's name stays `status-band`).
- The pictures in `docs/` are rebuilt from the current game: no key field, the scoreboard in the picture, the 5-hour reset shown as a clock time. `scripts/make-docs.ts` works again.

## 0.13.12

**The 5-hour limit shows when it resets.**
- Next to `5h 32%` the band now shows the clock time the window ends, small and dim: `5h 32% ↻5:44pm`. The 5-hour window has no fixed schedule, so the time is the useful part.
- It shows at every width. (The old `↻` countdown only appeared at 100+ columns, and the desktop band is about 95, so it never showed there.) On a wide band the wait follows in brackets: `↻5:44pm (2h14m)`.
- The weekly `7d` keeps its countdown on wide bands only, since that reset is on a known schedule.
- No reset time from the app: no stray `↻` is drawn.

## 0.13.11

**The first game says its keys in its own messages, not under the score.**
- Nothing is drawn under the `HI` score any more.
- The first game of a session says the keys in the strip beside the scoreboard (the line that says `bug! jump it, or land on it to fix it`): when you press play it reads `K jump · J duck · grab clouds, fix bugs`; the first bug note is `bug! K jumps it, or land on it to fix it`, the pit note `segfault! K to jump the gap` (the moth note already names J).
- From the second game on those messages are the usual ones, and the band is the same size in every game. The J and K keys work the same in every game (the hidden buttons, drawn afresh after the first game, as in 0.13.10).

## 0.13.10

**J and K again dead after the first game (0.13.9).**
- The trace of a 0.13.9 session shows the first game answering J (`press start via=button`) and then no press at all, not even a refused one: the hidden J / K buttons drawn while the first game was open stopped answering their hotkeys once it was over. In 0.13.7 the buttons were drawn afresh at that moment (the row of hints was swapped for the hidden box) and then answered for every game after, so the hidden box now gets a new key after the first game (`keys-hidden` then `keys-hidden-2`) and the engine mounts new buttons. It is the same swap 0.13.7 made, without the visible row.
- Two new trace lines for next time: `keys drawn <key> runs=<n>` when the box is drawn afresh, and `ui.press element=<key>` for each press the engine raises for the band's controls (a dead key can then be told from one that never reached the plugin).

## 0.13.9

- The first game's key hint (`J duck · K jump`) sits lower, with a clear row of air between it and the `HI` score above it (it was crowding it).

## 0.13.8

**The first game's key hint is part of the picture, so the band never changes size.**
- 0.13.7 put the J / K row above the picture for the first game, which made the band one row taller then and shorter afterwards. That row is gone for good: the band is the same size in every game.
- The hint (`J duck · K jump`) is now drawn inside the picture, right-aligned under the `HI` score, for the first game of a session only (it also steps aside while a new stage's title is up in that same row). From the second game on it is simply not drawn.
- The J and K buttons are always in the band, hidden (zero size, clipped, inside the band), so the keys work the same in every game.

## 0.13.7

**J and K keep working after the hints leave the screen.**
- 0.13.6 drew no J / K buttons from the second game on. But the desktop only hands keys to the game through a Button's hotkey (the band holds the focus after a click on Play), so with the buttons gone, J and K did nothing. The buttons are now always in the band's tree.
- First game of a session: the `▼ duck` / `▲ jump` row sits **above** the picture, on the left, opposite the scoreboard on the right (where the old key field was).
- From the second game on: the same two buttons are drawn in a Box with no size, clipped, at the picture's corner. Nothing shows (a visible hotkey would be drawn as a chip), but they stay inside the band and keep their hotkeys. K starts, retries and jumps; J ducks. Space, ↑ and ↓ still play from the prompt box.
- The text hint (`space / ↑ to start`) is gone: the buttons are the hint.

## 0.13.6

**The game is just the picture.**
- The key field on the left is gone, with the focus-ring code that fed it (`hooks/keys.ts`, the `ui.focus` hook, the "click here" / "esc to type" lines). Nothing is drawn above the picture; the scoreboard stays in its top-right corner.
- The first game of a session has one row **under** the picture: `space / ↑ to start` and the `J ▼ duck` / `K ▲ jump` buttons (J and K work).
- When that game is over, the row is gone for the rest of the session, buttons included: the desktop draws a hotkey as a chip, so a Button that keeps its hotkey cannot be hidden. From then on the keys are read at the prompt box: **Space** and **↑** start and jump, **↓** and **J** duck and **K** jumps while a run is live.
- Q no longer closes the game (it was a key of the field); the ■ close in the band does.
- The trace log names the real version (it said `v0.12.0` before).

## 0.13.5

- **J and K work again.** 0.13.3 took the `j` and `k` hotkeys off the duck and jump buttons together with their words, so those keys did nothing once the hints were gone. The buttons now always keep their hotkeys; only the words come and go.
- **Hints for the first game of each session only.** The first game shows `any key to start` and `J ▼ duck` / `K ▲ jump`; from the second game on, the line is empty and the buttons are blank (but still there, and still work). The count is per session, not kept between sessions.
- The trace log now names the real version (it said `v0.12.0` for every release since).
- The key field has no Enter label or submit button (Enter still plays).

## 0.13.3

- **The keys are taught, then quiet.** For a player's first 3 finished runs the line above the picture says `any key to start` / `any key to jump` and the buttons read `J ▼ duck` and `K ▲ jump`. After that the line is empty and the buttons have no words, so a regular player sees nothing but the game. The count of runs is kept between sessions. (`HINT_RUNS` in `hooks/crab/game.ts`.)
- `any key to retry` is gone for everyone: a run that is over shows `GAME OVER` in the picture, and any key still retries.
- A line that fixes something is still shown: `click here, then any key` (the keyboard has not reached the game) and `esc to type` (the game outlived the turn).
- The duck and jump buttons stay in place, blank: the arrow keys move the focus ring onto them, and that is how ↓ ducks and ↑ jumps while the key field has the focus.
- 6 new tests.

## 0.13.2

**A cleaner band while you play.** The line above the picture said the score, clouds, fixes and best, and the picture said them again; the line was too long for its field and ended in a cut-off word.
- The line is now just what the keys do: `any key to jump` (or `start`, `retry`). The star, the `game over 0365 · ☁ 3 · ✓ 6` text and the extra `jump` button next to the field are gone. The duck and jump buttons (J, K) stay on the right.
- The scoreboard (clouds, bugs fixed, score, best) is all in the top right corner. The top left, above the crab, is clear, so its whole jump can be seen.
- `GAME OVER` is drawn in the picture. Before a run starts the picture says what to do (`grab clouds, dodge or fix bugs`).
- The first-sight notes ("moth! duck under it...") moved up into the clear top row, between the crab and the scoreboard, so they no longer cover the clouds and shields they are about. On a very narrow field, where they do not fit, they stay where they were.
- 9 new tests (the line, the corner, the strip's placement at every field width).

## 0.13.1

- **Worlds stay longer.** A stage used to last 7 to 8 seconds, too short to see the costume or the world. Stages now come every 450 points (Beach 450, Kitchen 900, Speedway 1350, Build site 1800, Rainy city 2250, Storm at sea 2700, Moon 3150, lap 3600): about half a minute each, desktop or terminal. The difficulty curve is unchanged (it reads the score only), and the stage title stays up a little longer (3.6 s). A test holds every stage to at least 20 seconds.

## 0.13.0

**The journey.** As the score climbs, the crab changes costume by itself and the world changes with it. Eight stages, one per costume (Meadow, Beach, Kitchen, Speedway, Build site, Rainy city, Storm at sea, Moon), each with its own sky, far scenery, ground and weather (rain, steam, gulls, speed lines, sparks, lightning, a meteor), then round again. A stage gives +25 and shows its name under the score; nothing pauses or moves. The bugs, clouds and crab are the same in every world and the hit-boxes never change: the tests hold every world's colors to a contrast floor against what is played in front of it. Setting `costume = auto` is now this journey (it used to pick a new costume per run); naming a costume keeps that costume and its world for the whole run.

- **New costume: swimmer** (swim cap, goggles, striped ring, swaying snorkel).
- **Faster and harder.** Starts at 125 units/s (was 100) and reaches full speed (215) by a score of about 800 (was 1400). The gap to the next obstacle is sized for the speed the run will have when it arrives, not for the top speed, so the early game is about 40% denser. Obstacles unlock sooner (beetle 40, moth 70, twin 120, pit 180).
- **New hurdle: the tall stack** (from 300): only a jump near the top of the arc clears it; landing on top works too.
- **Gauntlets**: set pieces (staircase, duck-and-hop, pit with a bug on the far side, three in a row) that come more often as the score rises. A brute-force solver in the tests checks that each has a way through that forgives two ticks (80 ms) on every move, at every speed and pit width it can appear at.
- **Cheap to draw.** Worlds are drawn as part of the same plan the game already sends (no extra redraws): a stage that changes inside a plan swaps the costume and crossfades the sky in the picture itself. Repeating scenery is an SVG pattern tile, so it costs the same however far the picture scrolls; weather loops by itself on the display's clock. Sparse and slow tracks are sampled less often (a plan across a stage change is about 80 to 90 KB; the busiest plan at top speed stays under 100 KB). Reduced motion switches the loops off.
- **Terminal:** the same stage costumes, the stage name on the header for a moment, a tinted ground line, and a few dim pixels of rain, stars or speed lines.
- 35 new tests (stage maths, the journey end to end, fairness solver, contrast, markup, budgets).

## 0.12.0

- The project is now called **Claude Cockpit** (repository `claude-cockpit`, marketplace `claude-cockpit`; the plugin itself is still `status-band`). Install commands changed, see the README. The old GitHub address redirects.
- A new README written in plain language: what each number means, how Handoff works, when to use it, how the game plays, setup. New pictures: the band, a field guide to the game.

## 0.11.1

The first 0.11.0 hardening, after a report that pressing **K** made the crab jump on and on.

- **The band is no longer redrawn while a run plays.** 0.11.0 refreshed the score line five times a second, and the mascot's clock ticked every 0.35 s while Claude worked. If a surface restarts an animated picture whenever the band is drawn, every one of those restarts replays the picture from its first moment, the crab's jump included, so a single press looked like an endless jump. Now the **score, the clouds and the bugs fixed are drawn into the picture and counted by the picture**; the guidance line says the same thing for the whole run; the mascot holds still (`✻ working…`) while a run plays; the 20 s cache tick and the usage updates wait or are dropped when nothing changed. And if the band *is* redrawn by anything else (a turn ends, a limit moves), the game answers with a plan from that moment, once, never more than every 0.6 s.
- **One timer, set for what the rules say comes next** (the run ending if nothing is pressed, the plan running low, a look every second), instead of a step every 40 ms: a run at rest wakes the module about once a second. A stall of the whole app pauses the run instead of ending it.
- **A press is checked.** The same move twice within 70 ms (the key field and a hotkey both hearing one key, or a held key repeating) is one press. The field's text only counts when it did not shrink (a Backspace, or the field being emptied, is not a jump). A move of the focus ring onto Play is the click on Play arriving, never a key, so opening the game no longer starts the run by itself.
- **Every press goes to the trace** with where it came from (`press jump=-1->0 duck=0 queued=false via=field move=jump mode=play`), and so does the end of a run (`over score=… cause=… tick=…`) and every plan renewed because of someone else's redraw.
- **Half the markup**: drawings are a path a colour instead of a rect each, and the sky layers are one path each (a plan went from ~41 KB to ~20 KB).

## 0.11.0

**Smooth.** The desktop picture is no longer redrawn 25 times a second. The game plays the next 7.7 seconds of the run ahead, with the same rules, and the picture carries all of it as animation: the ground, the hills, the stars, the clouds, the bugs and the crab move on the display's own clock, between steps, at the screen's refresh rate. A late or uneven redraw can no longer make anything stutter or shake, at any speed. A new picture is drawn only when something changes the plan: a key press, a cloud grabbed or a bug fixed, the plan running low (every ~6 s), the end of a run. Each new picture starts part-way into a step (`begin` < 0) and is drawn a few milliseconds ahead, so it carries on from where the last one was. Setting **Game motion = classic** gives the 0.10 behaviour back if a surface does not animate.

**Wider.** The picture fills the band (it was capped at 540 px and left a blank right half): the field is as many units wide as the band has room for (260–520, two pixels a unit), with the speeds set so the way across takes the same few seconds.

**A real game.** Ducking and a dive; landing on a bug fixes it, with a bounce, points and chains; five kinds of obstacle that arrive by score (moth, twin bugs, pit as well as the ladybug and beetle); a shield pickup; first-of-a-kind announcements; the crab falls down a pit and flips on a hit. A parallax sky (hills, stars, far clouds) behind the ground.

## 0.10.0

The keys now have layers, because the desktop's focus rules cannot be tested outside the app and 0.9.0 depended on a single one of them.

- **Asking for the keys is repeated** (at once, then after 0.12, 0.35, 0.8 and 1.6 s): a click on ▶ play may not have made the band hold the keyboard by the first ask. If every ask is refused, the line says **click here, then any key**; one click on the field does it, and the line changes back as soon as a key comes through.
- **The arrows and Tab can no longer press things.** While the key field holds the ring, an arrow or Tab that would move it onto Play, ▲ jump or Handoff is turned into a jump and the ring stays on the field (so a Space can never close the game by pressing Play). The engine's own stops are never captured, so Esc and the way back to the prompt are never trapped.
- **▲ jump button** beside the field: works with the mouse, with `k` when the band holds the keyboard, and on surfaces without a text field.
- **A crash is not a retry:** presses in the first 0.45 s after a run ends are ignored.
- **The game says when Claude is done** (`esc to type`, plus a toast), since it keeps the keys until you press Esc.
- **The trace is kept across sessions** (`~/.claude/status-band-trace.log`, last 160 lines, time-stamped), so the evidence of a key that did nothing survives opening a new chat.
- Removed the click-to-focus `strip.tsx` module: the desktop always has a text field.

## 0.9.0

Keys on the desktop finally reach the game. The prompt box owns the keyboard there and the old route (`prompt.edit`) never fires, so Space / arrows did nothing unless you had first clicked the thin guidance line. Now:

- ▶ play moves the focus ring onto the guidance line, which is a native text field (`Input`): every printable key, `Enter`, and the arrows / Tab (which move the ring and are caught by a `ui.focus` hook) play. `q` closes.
- Any key but `q` plays in the terminal runner and in the click-focused `Client` fallback too.
- If the focus is refused, the reason is written to `~/.claude/status-band-trace.log` (`focus … denied: …`).

## 0.8.0

- Bugs replace the stones and cacti; blue clouds are collectible.
- Smoother and faster on the desktop: 25 frames a second (was 14), 75 units/s at the start (was 57), speeding up continuously instead of in steps; a late frame catches up so the speed stays true; a jump pressed just before landing is kept.
- One line of guidance instead of two: the line under the picture ("game over · space to retry, or click here") duplicated the line above it and is gone. The line above is now also the click target.
- Key handling hardened and instrumented (see Troubleshooting in the README).

## 0.7.x and earlier

- 0.7.x: the desktop game became a vector picture (SVG) instead of block characters; keys work without clicking the game first.
- 0.6.0: the Claude crab and its seven costumes; the first crab-run game.
- 0.4.x: the git row was removed from the band; the play button moved beside Handoff.
