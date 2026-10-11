#!/usr/bin/env python3
"""Preflight for Claude Cockpit (plugin `status-band`): run before every commit that will be pushed.

    python3 scripts/preflight.py

It keeps the plugin inside the rules of Anthropic's plugin directory (see docs/DIRECTORY-COMPLIANCE.md):
  1. `claude plugin validate --strict` and `claude plugin test`
  2. the version is the same in plugin.json, hooks/register.tsx and the top of CHANGELOG.md
  3. the code patterns the directory's scanner refuses (blockers) are absent
  4. every mods API call and every hook the code uses is named in README.md (the directory holds a
     plugin for review when the README does not say what the mod does)
  5. a call that was never approved (network, MCP, tools, agents...) fails until a person adds it to
     APPROVED_CALLS below AND explains it in the README and in docs/DIRECTORY-COMPLIANCE.md
  6. file limits (size, count, binary types), icon size, no secrets

Exit code 0 = safe to push. Anything else = fix first. Failures print what to do.
"""
from __future__ import annotations

import json
import re
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_MAIN = ROOT / 'hooks' / 'register.tsx'
README = (ROOT / 'README.md').read_text()

# Every mods API call the plugin is approved to make, and why. Adding one here is a policy decision:
# also describe it in README.md ("Privacy, and what this plugin runs") and docs/DIRECTORY-COMPLIANCE.md.
APPROVED_CALLS = {
    'clock.after', 'clock.every', 'clock.now',          # timers for the band and the game
    'session.usage', 'session.cwd', 'session.turns',     # the numbers the band shows; Handoff's folder
    'ui.resolve', 'ui.invalidate', 'ui.open', 'ui.close', 'ui.toast',  # drawing
    'store.get', 'store.set',                            # best score
    'model.fork',                                        # Handoff: one summary request, same session
    'command.run',                                       # Handoff: /clear only
    'prompt.fill',                                       # Handoff: fills the box, never submits
    'process.run',                                       # Handoff: four fixed read-only git commands
    'fs.read', 'fs.write',                               # the trace log and the handoff note
    'env.get',                                           # HOME only
}

# Never allowed without a deliberate policy decision (network, tools, other sessions, settings).
FORBIDDEN_TEXT = [
    (r'\$\.http\b', 'network call ($.http): the README promises the plugin makes no network call'),
    (r'\$\.mcp\b', 'MCP call ($.mcp)'),
    (r'\bfetch\s*\(', 'fetch(): network call'),
    (r'XMLHttpRequest|WebSocket\(', 'browser network API'),
    (r'child_process|require\(\s*[\'"]fs|from\s+[\'"]node:(fs|child_process|net|http)', 'Node module import: use the $ calls'),
    (r'\bprocess\.env\b', 'process.env: use $.env.get (and say why in the README)'),
    (r'\beval\s*\(|new Function\s*\(', 'dynamic code'),
    (r"on\(\s*'ui\.fault'", "ui.fault: not on the directory's event list (blocks the scan)"),
    (r'\bimport\s*\(', 'dynamic import()'),
]

SECRET_RE = re.compile(r'(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|PRIVATE) KEY|webhook[_ -]?secret\s*[:=]\s*\S{12,})', re.I)

ALLOWED_BINARY = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2', '.ttf', '.otf'}

failures: list[str] = []
notes: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def tracked_files() -> list[Path]:
    out = subprocess.run(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT, capture_output=True, text=True).stdout
    return [ROOT / p for p in out.split('\0') if p and (ROOT / p).is_file()]


def source_files() -> list[Path]:
    """The mod's own code (not tests, not scripts): what the directory scans."""
    return [p for p in (ROOT / 'hooks').rglob('*') if p.suffix in {'.ts', '.tsx', '.js', '.mjs'} and '.test.' not in p.name]


def strip_comments(text: str) -> str:
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'(^|[^:])//[^\n]*', r'\1', text)


# ---- 1. validate and test -------------------------------------------------------------------------
def run(label: str, cmd: list[str]) -> None:
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip().splitlines()
    if r.returncode != 0:
        fail(f'{label} failed:\n    ' + '\n    '.join(out[-12:]))
    else:
        notes.append(f'ok  {label}: {out[-1] if out else ""}')


run('claude plugin validate --strict', ['claude', 'plugin', 'validate', '--strict', '.'])
run('claude plugin test', ['claude', 'plugin', 'test', '.'])

# ---- 2. version sync ------------------------------------------------------------------------------
manifest = json.loads((ROOT / '.claude-plugin' / 'plugin.json').read_text())
ver = manifest.get('version')
m = re.search(r"const VERSION = '([^']+)'", SRC_MAIN.read_text())
code_ver = m.group(1) if m else None
cm = re.search(r'^## (\S+)', (ROOT / 'CHANGELOG.md').read_text(), re.M)
log_ver = cm.group(1) if cm else None
if not (ver == code_ver == log_ver):
    fail(f'version mismatch: plugin.json={ver} hooks/register.tsx={code_ver} CHANGELOG top={log_ver}. Bump all three together (the directory only publishes a new version when `version` rises).')
else:
    notes.append(f'ok  version {ver} in plugin.json, register.tsx and CHANGELOG')
for field in ('name', 'displayName', 'description', 'author', 'repository', 'license', 'icon', 'privacyPolicyUrl', 'version'):
    if not manifest.get(field):
        fail(f'plugin.json is missing `{field}` (the directory reads it for the listing)')
if manifest.get('name') != 'status-band':
    fail('plugin.json `name` must stay `status-band`: it is the permanent id of the published plugin')

# ---- 3. scanner blockers and forbidden patterns -----------------------------------------------------
all_calls: set[str] = set()
all_hooks: set[str] = set()
for f in source_files():
    raw = f.read_text()
    code = strip_comments(raw)
    rel = f.relative_to(ROOT)
    for pat, why in FORBIDDEN_TEXT:
        if re.search(pat, code):
            fail(f'{rel}: {why}')
    # blocker: h / Fragment used as a name of your own
    if f.suffix in {'.tsx', '.jsx'} and re.search(r'\b(const|let|var|function)\s+(h|Fragment)\b|\(\s*(h|Fragment)\s*[,):=]|\bimport\b[^;\n]*\b(h|Fragment)\b', code):
        fail(f'{rel}: a variable/parameter/import named `h` or `Fragment` (the directory refuses: JSX compiles to h()). Rename it.')
    # blocker: $ in a non-plain use
    for mm in re.finditer(r'(const|let)\s+(\w+)\s*=\s*(async\s*)?\(\s*\$', code):
        fail(f'{rel}: `{mm.group(2)}` is an arrow function taking `$`. Use a declared `function` (the directory reads `$` only as a plain $.noun.method(...) call or as a whole argument to a top-level function).')
    if re.search(r'\$\s*(\?\.|!\.|\[)|\(\$\s+as\b|\$\s+as\s', code):
        fail(f'{rel}: `$` used with ?. ! [] or a cast: write plain $.noun.method(...) calls')
    # blocker: Client may only appear as <els.Client module="./x.tsx" ...> or 'Client' in els
    for mm in re.finditer(r'\bClient\b', code):
        around = code[max(0, mm.start() - 6):mm.end() + 8]
        if not (re.search(r"<els\.Client\b", around) or re.search(r"'Client'\s+in\s+els", code[max(0, mm.start() - 2):mm.end() + 12])):
            line = code.count('\n', 0, mm.start()) + 1
            fail(f'{rel}:~{line}: `Client` used outside `<els.Client module="./file.tsx" ...>` / `\'Client\' in els` (the directory cannot read the file it loads)')
    if re.search(r'<els\.Client\b(?![^>]*\bmodule="\./[^"{}$]+")', code):
        fail(f'{rel}: <els.Client> without a literal module="./file.tsx"')
    # calls and hooks used
    for noun, meth in re.findall(r'\$\.(\w+)\.(\w+)', code):
        all_calls.add(f'{noun}.{meth}')
    all_hooks.update(re.findall(r"\bon\(\s*'([\w.]+)'", code))

# ---- 4/5. approved calls and README disclosure ----------------------------------------------------
for c in sorted(all_calls - APPROVED_CALLS):
    fail(f'new mods API call `$.{c}` is not approved. Decide first; then add it to APPROVED_CALLS, explain it in README "Privacy, and what this plugin runs" and in docs/DIRECTORY-COMPLIANCE.md.')
for c in sorted(APPROVED_CALLS - all_calls):
    notes.append(f'..  `{c}` is approved but no longer used: drop it from APPROVED_CALLS and the README when you can')
for c in sorted(all_calls & APPROVED_CALLS):
    if c not in README:
        fail(f'README does not name `{c}`. Every call the mod makes must be listed in "Privacy, and what this plugin runs".')
for h in sorted(all_hooks):
    if f'`{h}`' not in README:
        fail(f'README does not list the hook `{h}` ("Hooks it registers").')
if not re.search(r'no network|does not use the network', README, re.I):
    fail('README must state that the plugin makes no network calls (the Data handling answers say so).')
if 'Privacy, and what this plugin runs' not in README:
    fail('README lost its "Privacy, and what this plugin runs" section (privacyPolicyUrl points at it).')
if 'privacy-and-what-this-plugin-runs' not in str(manifest.get('privacyPolicyUrl', '')):
    fail('plugin.json privacyPolicyUrl must point at the README privacy section.')

# ---- 6. files, icon, secrets ------------------------------------------------------------------------
files = tracked_files()
if len(files) > 512:
    fail(f'{len(files)} files: the directory holds a plugin over 512 files for review')
for f in files:
    rel = f.relative_to(ROOT)
    size = f.stat().st_size
    ext = f.suffix.lower()
    if ext in {'.png', '.jpg', '.jpeg', '.gif', '.webp'}:
        pass
    elif ext in ALLOWED_BINARY:
        pass
    else:
        head = f.read_bytes()[:2048]
        if b'\0' in head:
            fail(f'{rel}: binary file the directory cannot inspect (only text, SVG, PNG/JPEG/GIF/WebP and fonts)')
        if size > 256 * 1024:
            fail(f'{rel}: {size // 1024} KiB text/code file (over 256 KiB is held for review; keep it out of git or shrink it)')
    if size > 5 * 1024 * 1024:
        fail(f'{rel}: over 5 MiB')
    if f.name in {'.npmrc', 'bunfig.toml', 'uv.toml', 'package-lock.json', 'bun.lock', 'bun.lockb', 'npm-shrinkwrap.json'}:
        fail(f'{rel}: package-manager file (held/blocked by the directory)')
    if f.name == '.DS_Store' or '__MACOSX' in f.parts:
        fail(f'{rel}: system file (blocks the scan)')
    if ext in {'.md', '.ts', '.tsx', '.js', '.json', '.mjs', '.py', '.html', '.svg'} and SECRET_RE.search(f.read_text(errors='ignore')):
        fail(f'{rel}: looks like a secret/token. Remove it (the repo is public).')
icon = ROOT / manifest.get('icon', '.claude-plugin/icon.png')
if icon.exists():
    d = icon.read_bytes()
    w, h = struct.unpack('>II', d[16:24]) if d[:8] == b'\x89PNG\r\n\x1a\n' else (0, 0)
    if not (w == h and 512 <= w <= 2048) or icon.stat().st_size > 2 * 1024 * 1024:
        fail(f'icon must be a square PNG 512-2048 px under 2 MB (is {w}x{h}). NOTE: the listing icon is taken only on the FIRST save/submit, so changing it later does not change the listing.')
else:
    fail('icon file missing')

# ---- report -----------------------------------------------------------------------------------------
print('\n'.join(notes))
if failures:
    print(f'\nPREFLIGHT FAILED ({len(failures)}):')
    for f in failures:
        print(' x ' + f)
    print('\nSee docs/DIRECTORY-COMPLIANCE.md. Do not push until this is clean.')
    sys.exit(1)
print('\nPREFLIGHT OK. Now: push, then confirm the plugin page in claude.ai/directory/manage shows the new commit scanned.')
