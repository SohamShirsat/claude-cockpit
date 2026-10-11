# Claude Cockpit (plugin `status-band`): instructions for Claude working in this folder

This repo is a Claude Code mod that is **listed in Anthropic's plugin directory**. Every push to `main` is
scanned again. Keep it compliant on every change.

## Always

1. Before changing code, README, `plugin.json` or assets, read `docs/DIRECTORY-COMPLIANCE.md` (the rules we
   learned from the scanner, what we promised in the submission, the per-change checklist).
2. Before every push, run `python3 scripts/preflight.py`. Do not push on a failure.
3. Bump the version in all three places together (`.claude-plugin/plugin.json`, `const VERSION` in
   `hooks/register.tsx`, top heading of `CHANGELOG.md`) for any change that should reach users.
4. Keep `README.md` section "Privacy, and what this plugin runs" true. If you add, remove or change a
   `$.noun.method` call, a hook, a started program, a file read or written, or anything sent, update that
   section and `docs/DIRECTORY-COMPLIANCE.md` in the same commit. The preflight checks the call and hook names.
5. After pushing, check the plugin page https://claude.ai/directory/manage/plugins/d21ae908-40ee-432d-a875-b6047064e177
   for the new version's scan result, and fix findings. Add anything new you learn to the compliance doc.

## Never

- Never change the plugin `name` (`status-band`): it is the permanent id. Use `displayName` for the label.
- Never add a network call (`$.http`, `$.mcp`, `fetch`), analytics, an MCP server, a package launcher
  (`npx`/`uvx`), or a dependency install. Never read env vars other than `HOME`.
- Never write a settings, start-up, build or instruction file from the mod. Never run slash commands other
  than `/clear` on Handoff. Never make the plugin submit a prompt for the user.
- Never put a secret, token or the push-webhook secret in any file, commit, log or the README. The repo is public.
- Never describe the plugin as official or made by Anthropic.
- Never commit files over 256 KiB, binaries other than images/fonts, `.DS_Store`, or the git-ignored
  `.claude-plugin/types/` stubs.
- Do not rewrite the code patterns listed under "Code rules" in the compliance doc (plain `$` calls, no arrow
  functions taking `$`, `<els.Client module="./runner.tsx">` only, no `h`/`Fragment` names, no `ui.fault`).

## Day to day

- Test: `claude plugin test .`  Validate: `claude plugin validate --strict .`
- After edits, update the desktop's cached install: `claude plugin update status-band@claude-cockpit`, restart.
- Rebuild the doc pictures when the look changes (README, "For developers").
- Ask Soham before anything that changes what was attested in the portal (see the compliance doc), before
  touching the directory submission itself (withdraw, settings, rotate secret), and before anything outward-facing.
