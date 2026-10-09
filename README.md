# status-band

Compact text band above the Claude Code prompt.

- ctx %, tokens, cache countdown (60 min, set `cacheTtlMinutes`), 5h / 7d limits, cost
- `⤴ Handoff` button (right): click, confirm, it summarizes the chat, saves it to `~/.claude/handoffs/`, runs `/clear`, and pastes the note into the prompt (the note names the session folder's repo and branch, read once when it is written)
- while Claude works the handoff slot becomes a small animated mascot with a timer
- `▶ play` just left of the handoff slot (it pulses while Claude works) opens **Claude runner** (`hooks/runner.tsx`): space / ↑ / click to jump, `q` or `■ close` shuts it. The game sits under the band, or in a pane of its own when the band is under 6 rows. High score is kept in `$.store`. Drawn on your machine: zero model calls, zero tokens. Setting `buddy`: `game` (default), `mascot` (no play control), `off`

Install (terminal): `/plugin install status-band --marketplace /Users/soham/ClaudeMods/status-band`
Check: `claude plugin validate .` and `claude plugin test .`

After editing: bump `version` in `.claude-plugin/plugin.json`, run `claude plugin update status-band@soham-mods`, then a new session. Sessions run the installed copy, not this folder, so an edit without the update changes nothing. `~/.claude/status-band-trace.log` names the version a session loaded.
