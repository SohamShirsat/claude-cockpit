# Changelog

What changed in each version, newest first. (The plugin's version lives in `.claude-plugin/plugin.json`.)

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
