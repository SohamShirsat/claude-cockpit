# status-band

Compact text band above the Claude Code prompt.

- ctx %, tokens, cache countdown (60 min, set `cacheTtlMinutes`), 5h / 7d limits, cost
- `⤴ Handoff` button (right): click, confirm, it summarizes the chat, saves it to `~/.claude/handoffs/`, runs `/clear`, and pastes the note into the prompt (the note names the session folder's repo and branch, read once when it is written)
- while Claude works the handoff slot becomes a small animated mascot with a timer
- `▶ play` just left of the handoff slot (it pulses while Claude works) opens **Claude runner**: you play the Claude crab, with a costume per run (setting `costume`: `auto` or astronaut, detective, engineer, chef, racer, pirate, plain). Dodge the stones and cacti. **Keys:** the prompt box owns the keyboard, so the band reads **Space and ↑ at an empty prompt box** (`prompt.edit`) while the game is open, no click needed; **`k`** works too once the band has been clicked (the `k: jump` button); clicking the strip under the picture gives it the keyboard (space / ↑ / `q`). Typing a draft is never touched. `■ close` shuts the game. Two drawings of one game (`hooks/crab/game.ts` holds the rules): on the **desktop** a vector scene (`hooks/crab/scene.ts`, the full-size crab, animated) with a one-row key strip under it (`hooks/strip.tsx`: click it, then space / ↑ work too); in a **terminal** half-block pixels (`hooks/runner.tsx`). The desktop draws text in a proportional font, which cannot lay block characters out as pixels, hence the picture. Sits under the band, or in a pane of its own when the band is shorter than the game (8 rows desktop, 7 terminal). High score is kept in `$.store`. Zero model calls, zero tokens. Setting `buddy`: `game` (default), `mascot` (no play control), `off`

**The crab** (`hooks/crab/`, `assets/crab/`): all seven costumes saved as data, SVG (animated), PNG and JSON, plus the 9px game-size versions. See `assets/crab/README.md` for what is there and how to reuse it.

Look at the art without running the app: `node --import ./scripts/ts-loader.mjs scripts/preview-scene.ts scene.html`.

Install (terminal): `/plugin install status-band --marketplace /Users/soham/ClaudeMods/status-band`
Check: `claude plugin validate .` and `claude plugin test .`

After editing: bump `version` in `.claude-plugin/plugin.json`, run `claude plugin update status-band@soham-mods`, then a new session. Sessions run the installed copy, not this folder, so an edit without the update changes nothing. `~/.claude/status-band-trace.log` names the version a session loaded.
