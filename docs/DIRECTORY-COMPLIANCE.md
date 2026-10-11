# Directory compliance: the standing rules for Claude Cockpit

Claude Cockpit (plugin id `status-band`) is listed in Anthropic's plugin directory. Every change we make goes
through the directory's scan again, so this file is the single place that says what the directory checks, what
we promised in our submission, and what to do on every change. **Read it before changing code, the README,
`plugin.json`, or the assets. Keep it current: if you learn a new rule, add it here in the same commit.**

Run `python3 scripts/preflight.py` before every push. It enforces most of this file; a failure is a stop.

## Identity (do not change)

| | |
| --- | --- |
| Plugin id (`name`) | `status-band`. **Permanent.** A rename breaks every install. Change only `displayName` for the label. |
| Display name | Claude Cockpit |
| Repo | https://github.com/SohamShirsat/claude-cockpit (public, tracked branch `main`, plugin at the repo root) |
| Directory page | https://claude.ai/directory/manage/plugins/d21ae908-40ee-432d-a875-b6047064e177 |
| Listed on | Claude Code only (the directory lists mods for Claude Code only) |
| First submission | v0.13.17, commit 98fc5ea, 2026-10-12. Held for policy review (see "Known holds"). |
| Submitted by | Soham, plan Pro, contact email in the portal |

## What we told the directory (keep it true)

These were attested in the portal. If a change makes any of them false, **stop and ask Soham** before pushing.

- **Network:** the plugin makes no network call. No `$.http`, no `$.mcp`, no `fetch`, no analytics, no server.
- **Personal data:** "Reads and stores", because Handoff saves a model-written chat summary to a local file. Nothing leaves the machine.
- **Data sent to a service other than declared connectors:** No. There are no connectors.
- **Retention by a service of ours:** Not retained (we run no service).
- **Under 18:** No. Developers only.
- **Compliance boxes ticked:** Software Directory Terms and Policy, privacy policy accurate, does not exfiltrate credentials, Anthropic may contact us.
- **Privacy policy URL:** the README section "Privacy, and what this plugin runs" (`privacyPolicyUrl` in `plugin.json`). It must stay accurate and keep that exact heading.

## Every change: the checklist

1. **Change code or docs.** Keep to the code rules below.
2. **Bump the version** in three places, same number: `.claude-plugin/plugin.json` `version`, `const VERSION` in `hooks/register.tsx`, and a new top heading in `CHANGELOG.md`. The directory only publishes a new version when `version` rises.
3. **Update the README privacy section** if the change adds, removes or changes: a mods API call, a hook, a program that is started, a file that is read or written, anything the plugin sends, a new Handoff behavior. The README must name every `$.noun.method` call and every hook (`preflight.py` checks).
4. **Update this file** if a rule, a promise, or the known-holds list changes.
5. **Rebuild the pictures** (`docs/*.png`) if the band or the game looks different: `node --import ./scripts/ts-loader.mjs scripts/make-docs.ts /tmp/docs-build`, then screenshot each page at 2x (see the README "For developers").
6. **Run `python3 scripts/preflight.py`.** Fix until it says `PREFLIGHT OK`.
7. **Commit and push to `main`.** The directory picks up the commit (a push webhook if set up, otherwise the scheduled check about every 6 hours, or "Check for new commits" on the plugin page).
8. **Check the plugin page** (link above): the new version should show as detected and scanned. Read the Versions tab for findings. Fix and repeat if it did not pass.
9. **Update the local install** so it matches: `claude plugin update status-band@claude-cockpit`, then restart.

## Code rules the directory's scanner enforces (these were real blockers)

The portal's scanner reads the source as text, stricter than `claude plugin validate`. Learned from our first scan (7 blockers):

- **`$` is only ever a plain call `$.noun.method(...)`**, or passed whole as an argument to a function declared with `function` at the top level of the same file. Never an arrow function taking `$` (`const f = ($) => ...` is flagged), never `$?.`, `$!`, `$[...]`, a cast, or wrapped in parentheses. `git()` used to be an arrow and was a blocker.
- **`on('event', ...)` on its own line**, with an event name from Claude Code's known list. `ui.fault` is *not* on the directory's list: using it was a blocker. Do not add a hook until you have checked the event name against the directory's list (a failed scan names it).
- **`Client` (the terminal game's file loader)** may appear only as `<els.Client key=... module="./runner.tsx" ...>` with a literal string path, and as `'Client' in els`. Any other mention of the name `Client` (a destructure, `!Client`, `Client !== null`) was flagged as "path not a fixed string". The path must be a fixed string, never built.
- **No variable, parameter, function or import named `h` or `Fragment` in a `.tsx`/`.jsx` file** (JSX compiles to `h()` calls). `clockAt` once had a local `h`.
- **No dynamic `import()`**, no `eval`, no `process.env`, no Node module imports. Use the `$` calls.
- **Readable source only**: no minified, packed or compiled code in git.
- **No package launchers** (`npx`, `uvx`, ...) and no `.npmrc`/`bunfig.toml`/`uv.toml`/lockfiles.
- **Fixed commands**: any program the plugin starts is written out in full in the call (the four `git` commands). Do not build a command from variables.

## Policy holds (not blockers; they send a version to a human reviewer)

A hold is not a rejection, but each new version can be held again. We reduce them by being truthful in the README. Do not add new ones without a reason.

| Hold the portal raised | Why it fires | What we do |
| --- | --- | --- |
| Mod can read local data/conversation **and** send data out | `$.session.*` next to `$.process.run` / `$.model.fork` | README lists each call and says nothing leaves the machine |
| Starts other programs / command not read in full | four `git` calls on Handoff | Fixed text in the call; README lists the exact commands |
| Writes a file other tools run or obey | `$.fs.write` of the trace log and handoff note under `~/.claude` | README says they are plain logs/notes that nothing runs; never write a settings, start-up, build or instruction file |
| Runs slash commands itself | `$.command.run` for `/clear` on Handoff | README says: `/clear` only, only after the note is saved, only when the user pressed Handoff |
| Image/font file that code could run (4 findings) | PNG assets, nothing runs them | Leave as is; keep images complete and valid |
| Uses a credential from the user's machine (2 findings) | `$.env.get('HOME')` | README says HOME only, no other variable |
| Name may be confused with an existing listing | `status-band` is close to `statusbar` (sym1000/claude-statusbar); "Claude" in the display name may match a brand | Decision pending with the reviewer. Never use "official", "Anthropic" or similar in the name. |

## The hard limits (the directory holds or blocks a plugin that breaks these)

- Repo under 50 MiB archived / 256 MiB unpacked, under 10,000 entries; **plugin at most 512 files**.
- **Every non-image, non-font file under 256 KiB.** Dev-only type stubs (`.claude-plugin/types/**`, about 1.4 MB) are git-ignored for this reason; keep them out of git.
- Only text, SVG, complete PNG/JPEG/GIF/WebP and font files. No `.pdf`, `.zip`, `.ico`, executables.
- **No `CLAUDE.md` or `AGENTS.md` at the plugin root** (validator warning: not loaded as context). The maintainer instructions live in `.claude/CLAUDE.md`.
- No symlinks, submodules, LFS pointers, `.DS_Store`, `Thumbs.db`, `__MACOSX`.
- README of at least 40 words (ours is long, keep it) and a LICENSE (MIT, in the repo).
- **Icon**: `.claude-plugin/icon.png`, square PNG 512-2048 px, under 2 MB. The listing takes the icon only once, at the first save/submit: changing the file later does not change the listing.
- No secrets in any file or in the README, ever. **Never write the webhook secret anywhere in the repo.**
- Never call the plugin official, never imply Anthropic made it. The README says it is a community project; keep that line.

## Known holds on the first submission and open items

- Review is pending. Anthropic publishes no timeline.
- **Push webhook:** the portal offers GitHub push updates (payload URL + one-time secret). Not yet added to the GitHub repo. Until then the directory checks about every 6 hours. If it is set up: repo Settings -> Webhooks, content type `application/json`, push event only. The secret is shown once and lives only in GitHub and the portal; "Rotate secret" is on the plugin's Settings tab.
- **Auto-publish** does not apply while the plugin is held ("no version goes live without an Anthropic reviewer"). Revisit after approval: keep it off unless Soham decides otherwise, since we push often.
- The `types` and `icon` manifest fields give "unknown field" style warnings in the portal. `types` is needed for the mod's state declaration; `icon` is read by the directory. Both are fine.

## When something changes in the directory's rules

The portal's Validate report is the source of truth. After any scan that raises a new finding: open the finding, fix the cause, add the rule to "Code rules" or "Policy holds" above, and add a check to `scripts/preflight.py` if it can be automated, in the same commit.
