import { atom, read, update } from 'claude-code'
import type { Elements, Hook, Register } from 'claude-code'

import type { Cache, Game, HandoffPhase, Repo, Usage } from '../types'
import { act, deskConfig, fresh, header, lookFor, step } from './crab/game'
import { sceneSvg } from './crab/scene'

type Dollar = Parameters<Hook<'session.start'>>[0]

const usageAtom = atom({ plugin: 'status-band', key: 'usage' } as const, null)
const cacheAtom = atom({ plugin: 'status-band', key: 'cache' } as const, null)
const handoffAtom = atom({ plugin: 'status-band', key: 'handoff' } as const, 'idle')
const bestAtom = atom({ plugin: 'status-band', key: 'best' } as const, 0)
const gameAtom = atom({ plugin: 'status-band', key: 'gameOpen' } as const, false)
const runAtom = atom({ plugin: 'status-band', key: 'game' } as const, null)
// the terminal's game lives in its Client: each press of the prompt's keys bumps this, and the Client acts on a change
const signalAtom = atom({ plugin: 'status-band', key: 'jumpSignal' } as const, 0)

const VERSION = '0.9.0'
// rows the game takes: the terminal's is a header, the five rows of the field and the ground;
// the desktop's the one line of guidance (which is also the click target) and the picture (108 px)
const GAME_ROWS = { text: 7, svg: 7 } as const
// a tick that comes late runs the steps it owes (up to this many), so the speed stays true
const MAX_CATCHUP = 4
const SCENE_PX_PER_COL = 7.6
const SCENE_MAX_WIDTH = 540
const GAME_PANE = 'status-band-runner'
// the desktop's key sink: a native text field that takes every printable key while it has the focus
const KEYS = 'keys'

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const dirName = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/'

const kilo = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : `${n}`)

const until = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d${Math.floor((mins % 1440) / 60)}h`
  if (mins >= 60) return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`
  return `${mins}m`
}

const level = (pct: number) => (pct >= 85 ? 'error' : pct >= 60 ? 'warning' : 'success')

const toUsage = (
  context: { percent?: number; tokens?: number; window: number },
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[],
  cost?: { usd: number },
): Usage => ({
  ctxPercent: context.percent,
  ctxTokens: context.tokens,
  ctxWindow: context.window,
  limits: rateLimits.map(r => ({ kind: r.kind, percent: r.percentUsed, resetsAt: r.resetsAt })),
  cost: cost?.usd,
})

async function run($: Dollar, dir: string, argv: string[], timeoutMs = 4000) {
  try {
    return await $.process.run(argv, { cwd: dir, timeoutMs })
  } catch {
    return null
  }
}

const git = ($: Dollar, dir: string, args: string[]) => run($, dir, ['git', ...args])

// the repo the session sits in, read once when a handoff is written
async function readRepo($: Dollar, dir: string): Promise<Repo | null> {
  const [top, br, sha, st] = await Promise.all([
    git($, dir, ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir']),
    git($, dir, ['branch', '--show-current']),
    git($, dir, ['rev-parse', '--short', 'HEAD']),
    git($, dir, ['status', '--porcelain', '-uno']),
  ])
  if (!top || top.exitCode !== 0) return null
  const [root, gitDir, common] = top.stdout.trim().split('\n')
  if (!root || !gitDir || !common) return null
  const mainDir = common.endsWith('/.git') ? dirName(common) : common

  return {
    root,
    name: baseName(mainDir).replace(/\.git$/, ''),
    branch: br?.stdout.trim() || (sha?.exitCode === 0 ? `@${sha.stdout.trim()}` : 'no commits'),
    isWorktree: gitDir !== common,
    worktree: baseName(root),
    dirty: st?.exitCode === 0 ? st.stdout.split('\n').filter(Boolean).length : 0,
  }
}

const S = {
  ticking: false,
  trace: [] as string[],
  confirmTimer: null as { cancel: () => void } | null,
  workTimer: null as { cancel: () => void } | null,
  workStart: 0,
  bandRows: 99,
  isPaneOpen: false,
  gameTimer: null as { cancel: () => void } | null,
  isGameBusy: false,
  lastTick: 0,
  owed: 0,
  logged: 0,
  costume: 'auto',
  gameSurface: 'text' as 'text' | 'svg',
  dims: new Set<string>(),
  bandId: '',
  refocus: false,
}

// small trace file for debugging what the band was asked to draw: ~/.claude/status-band-trace.log
async function trace($: Dollar, line: string) {
  S.trace = [...S.trace, line].slice(-40)
  try {
    const home = await $.env.get('HOME')
    await $.fs.write(`${home ?? '.'}/.claude/status-band-trace.log`, `${S.trace.join('\n')}\n`)
  } catch {
    // the trace is a debugging aid: the band never depends on it
  }
}

// the countdowns move on their own: one slow redraw timer per load of the module
function startTicking($: Dollar) {
  if (S.ticking) return
  S.ticking = true
  $.clock.every(20000, () => $.ui.invalidate('ui.render'))
}

function toast($: Dollar, text: string) {
  try {
    $.ui.toast(text)
  } catch {
    // nothing to say it on
  }
}


const BUDDY_TICK_MS = 350
const BUDDY_WIDTH = 18
const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
const QUICK = ['thinking', 'cooking', 'noodling', 'tinkering', 'pondering', 'brewing', 'wrangling', 'untangling']
const LONG = ['still on it', 'deep in it', 'big one', 'nearly there']

// the animated mascot is plain text redrawn by the hooks module (a timer only runs while Claude works)
function mascotParts(ms: number) {
  const n = Math.floor(ms / BUDDY_TICK_MS)
  const sec = Math.floor(ms / 1000)
  const words = sec < 30 ? QUICK : LONG
  const verb = `${words[Math.floor(sec / 7) % words.length]}…`
  const at = n % (verb.length + 5)
  const time = ` ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
  return {
    glyph: FRAMES[n % FRAMES.length] ?? '✻',
    pre: verb.slice(0, Math.min(at, verb.length)),
    hot: at < verb.length ? (verb[at] ?? '') : '',
    post: at < verb.length ? verb.slice(at + 1) : '',
    time,
    used: 2 + verb.length + time.length,
  }
}

function startBuddy($: Dollar, now: number) {
  if (S.workStart === 0) S.workStart = now
  if (!S.workTimer) S.workTimer = $.clock.every(BUDDY_TICK_MS, () => $.ui.invalidate('ui.render'))
}

function stopBuddy() {
  if (S.workTimer) S.workTimer.cancel()
  S.workTimer = null
  S.workStart = 0
}

const HANDOFF_PROMPT =
  'Write a handoff note so a brand-new chat can continue this work with zero memory of this one. Output ONLY the note in markdown, at most 450 words, no preamble. Sections: **Goal** (1-2 lines). **State** (done / working / in progress). **Decisions** (key choices and why, plus approaches rejected). **Files & places** (exact paths, commands, branches, identifiers central to the work). **Next steps** (ordered, concrete; the first must be actionable immediately). **Gotchas** (errors hit, constraints, instructions or preferences the user gave that must persist, things NOT to redo). Be specific, skip anything not needed to continue, include no secrets or credentials.'

const HANDOFF_INTRO =
  'Handoff from my previous chat. Read it, reply with one line confirming the goal and your first step, then continue from Next steps. Do not redo finished work.'

const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

async function setHandoff($: Dollar, phase: HandoffPhase) {
  await update($, handoffAtom, () => phase)
}

async function pressHandoff($: Dollar) {
  const phase = await read($, handoffAtom)
  if (phase === 'running') return
  if (S.confirmTimer) S.confirmTimer.cancel()
  S.confirmTimer = null
  if (phase === 'idle') {
    await setHandoff($, 'confirm')
    S.confirmTimer = $.clock.after(6000, () => void setHandoff($, 'idle'))
    return
  }
  await runHandoff($)
}

async function runHandoff($: Dollar) {
  await setHandoff($, 'running')
  try {
    const [usage, cwd, now, home] = await Promise.all([
      read($, usageAtom),
      $.session.cwd(),
      $.clock.now(),
      $.env.get('HOME'),
    ])
    const repo = await readRepo($, cwd)

    // the fork reads the live transcript through the prompt cache: cheap while warm
    const note = await $.model.fork({ prompt: HANDOFF_PROMPT })
    if (!note.isAnswered) {
      $.ui.toast(
        note.reason === 'nothing-to-fork'
          ? 'Handoff: nothing to hand off yet.'
          : `Handoff failed (${note.reason}). Chat kept as is.`,
      )
      return
    }

    const lines = [`# Handoff ${stamp(now)}`, `cwd: ${cwd}`]
    if (repo) {
      const wt = repo.isWorktree ? ` (worktree ${repo.worktree})` : ''
      const dirty = repo.dirty > 0 ? `, ${repo.dirty} uncommitted` : ''
      lines.push(`working in: ${repo.name} on ${repo.branch}${wt}${dirty} - ${repo.root}`)
    }
    if (usage?.ctxPercent !== undefined) lines.push(`previous chat context: ${usage.ctxPercent}% full`)
    const body = `${lines.join('\n')}\n\n${note.text.trim()}\n`

    // safety copy first: the chat is only cleared once the note is safe
    let saved = ''
    try {
      saved = `${home ?? '.'}/.claude/handoffs/${stamp(now).replace(/[: ]/g, '-')}.md`
      await $.fs.write(saved, body)
    } catch {
      saved = ''
    }

    let isCleared = true
    try {
      await $.command.run({ command: 'clear' })
      isCleared = (await $.session.turns()) === 0
    } catch {
      isCleared = false
    }
    await update($, cacheAtom, () => null)
    await update($, usageAtom, () => null)

    const filled = await $.prompt.fill({ text: `${HANDOFF_INTRO}\n\n${body}` })
    if (!isCleared) {
      $.ui.toast(`Handoff written but /clear did not run: type /clear, then paste${saved ? ` (copy: ${saved})` : ''}.`)
    } else if (!filled.isFilled) {
      $.ui.toast(`Cleared. Handoff could not fill the prompt${saved ? `: ${saved}` : ''}.`)
    } else {
      $.ui.toast('Handoff pasted in a fresh chat. Press Enter to start.')
    }
  } catch {
    $.ui.toast('Handoff failed; chat kept as is.')
  } finally {
    await setHandoff($, 'idle')
  }
}

function stopGameTimer() {
  if (S.gameTimer) S.gameTimer.cancel()
  S.gameTimer = null
}

async function saveBest($: Dollar, score: number) {
  const best = Math.min(Math.floor(score), 99999)
  if (!(best > (await read($, bestAtom)))) return
  await update($, bestAtom, () => best)
  try {
    await $.store.set('best', best)
  } catch {
    // the score still shows this session
  }
}

// the desktop's game: the hooks module owns the run and steps it on a timer while it is live;
// the picture is drawn from it (hooks/crab/scene.ts) and the guidance line only reports presses.
// Every change to the run goes through `update`, so a press and a tick that land together both count.
async function tickGame($: Dollar) {
  if (S.isGameBusy) return
  S.isGameBusy = true
  try {
    const live = await read($, runAtom)
    if (!live || live.mode !== 'play') {
      stopGameTimer()
      return
    }
    // the steps owed since the last tick: one when the timer is on time, more when a frame ran long
    const now = await $.clock.now()
    const ms = deskConfig.tickMs
    const elapsed = S.lastTick === 0 || now <= S.lastTick ? ms : now - S.lastTick
    S.lastTick = now
    S.owed = Math.min(S.owed + elapsed, ms * MAX_CATCHUP)
    const due = Math.floor(S.owed / ms + 0.2)
    if (due < 1) return
    S.owed -= due * ms
    const next = await update($, runAtom, g => {
      if (!g || g.mode !== 'play') return g
      let n = g
      for (let i = 0; i < due && n.mode === 'play'; i++) n = step(n, deskConfig)

      return n
    })
    if (next?.mode === 'over') {
      stopGameTimer()
      await saveBest($, next.best)
    }
  } finally {
    S.isGameBusy = false
  }
}

// a press starts a run, retries after one, or jumps
async function pressJump($: Dollar) {
  let isStart = false
  const next = await update($, runAtom, g => {
    isStart = g !== null && g.mode !== 'play'

    return g ? act(g, deskConfig) : g
  })
  if (isStart && next?.mode === 'play' && !S.gameTimer) {
    S.lastTick = 0
    S.owed = 0
    S.gameTimer = $.clock.every(deskConfig.tickMs, () => void tickGame($))
  }
}

// the keys that play, read at the prompt box: it owns the keyboard, so a key reaches a game that
// was never clicked only this way. Space and ↑ always; k only while a run is live, so a draft that
// starts with k is never in the way while the game waits. Only an empty box is ever touched.
const SPACE_KEYS = new Set([' ', 'space', 'up', 'down', 'w'])

async function isGameKey($: Dollar, e: { text: string; inputText: string; key?: { key: string; ctrl?: true; meta?: true } }) {
  if (e.text !== '' || e.key?.ctrl || e.key?.meta) return false
  if (!(await read($, gameAtom))) return false
  const k = e.key?.key
  // a space with no key named (folded into a burst) is still only blank
  if (k === undefined) return e.inputText !== '' && e.inputText.trim() === ''
  if (SPACE_KEYS.has(k)) return e.inputText.trim() === ''
  if (k === 'k') return S.gameSurface === 'svg' && (await read($, runAtom))?.mode === 'play'

  return false
}

async function pressKeys($: Dollar) {
  if (S.gameSurface === 'svg') await pressJump($)
  else await update($, signalAtom, n => (n ?? 0) + 1)
}

// the game takes the keyboard: the desktop's key field is given the focus ring, so Space, the
// arrows and the rest reach it without a click on it first. The keyboard is the person's to give,
// so the answer (and why not) goes to the trace.
async function focusGame($: Dollar) {
  if (S.gameSurface !== 'svg') return
  const id = S.isPaneOpen ? GAME_PANE : S.bandId
  if (!id) return
  try {
    const r = await $.ui.focus({ requestId: id, key: KEYS })
    void trace($, `focus ${id} ${r.deny ? `denied: ${r.deny}` : 'ok'}`)
  } catch (err) {
    void trace($, `focus ${id} failed: ${String(err)}`)
  }
}

// every key the key field takes: q closes the game, anything else plays
async function typedKeys($: Dollar, text: string) {
  if (!text) return
  if (S.logged < 24) {
    S.logged++
    void trace($, `press via=input ${JSON.stringify(text)}`)
  }
  if (text.trim().toLowerCase().endsWith('q')) await closeGame($)
  else await pressJump($)
}

async function closeGame($: Dollar) {
  stopGameTimer()
  await update($, gameAtom, () => false)
  await update($, runAtom, () => null)
  if (!S.isPaneOpen) return
  S.isPaneOpen = false
  try {
    await $.ui.close({ id: GAME_PANE })
  } catch {
    // already gone
  }
}

// the game sits in the band when the band has the rows for it, else in a pane of its own
async function toggleGame($: Dollar, isSvg: boolean) {
  if (await read($, gameAtom)) {
    await closeGame($)
    return
  }
  const rows = isSvg ? GAME_ROWS.svg : GAME_ROWS.text
  S.gameSurface = isSvg ? 'svg' : 'text'
  S.logged = 0
  if (S.bandRows < 1 + rows) {
    let isPlaced = false
    try {
      isPlaced = (await $.ui.open({ id: GAME_PANE, title: 'Claude runner', rows: rows + 1, focus: true, closeOnEscape: true })).isPlaced
    } catch {
      isPlaced = false
    }
    if (!isPlaced) {
      toast($, 'No room for the game here: make the window taller.')
      return
    }
    S.isPaneOpen = true
  }
  const [best, now] = await Promise.all([read($, bestAtom), $.clock.now()])
  await update($, runAtom, () => fresh(best, 1 + (now % 99991), 'ready', lookFor(S.costume, Math.floor(now / 60000)), deskConfig))
  await update($, gameAtom, () => true)
  // Play was a click in the band: hand the keyboard to the game's key field once it is drawn
  await focusGame($)
}

type VectorEls = Elements['desktop'] | Elements['vscode'] | Elements['mobile']

// the picture of the run with its one line of guidance above: where the surface can take keys,
// that line is a `Client` (a click on it jumps and gives it the keyboard); elsewhere it is plain
// text, with a jump button under the picture
function sceneView($: Dollar, els: VectorEls, surface: string, run: Game, bodyColumns: number) {
  const { Box, Button, Svg, Text } = els
  // the desktop's guidance line is a native text field: it takes the focus ring (so Play can hand it
  // the keyboard), every printable key reaches it, and Enter plays. Failing that, a `Client` that
  // reads keys after a click; failing that, plain text with a jump button under the picture.
  const Input = surface === 'desktop' && 'Input' in els ? els.Input : null
  const Client = !Input && surface === 'desktop' && 'Client' in els ? els.Client : null
  const width = Math.max(150, Math.min(SCENE_MAX_WIDTH, Math.floor(bodyColumns * SCENE_PX_PER_COL)))
  const height = Math.round(width / 5)
  const line = header(run, Input ? 'any key' : undefined)

  return (
    <Box key="game" flexDirection="column">
      {Input ? (
        <Input
          key={KEYS}
          label="✻"
          placeholder={line.trim()}
          value=""
          submitLabel="jump"
          autoFocus
          onInput={text => void typedKeys($, text)}
          onSubmit={() => void pressJump($)}
        />
      ) : Client ? (
        <Client key="strip" module="./strip.tsx" props={{ text: line }} width={Math.min(bodyColumns, 62)} />
      ) : (
        <Box>
          <Text color="claude" bold>
            ✻
          </Text>
          <Text dimColor>{line}</Text>
        </Box>
      )}
      <Svg
        key="scene"
        source={sceneSvg(run, deskConfig, { width, height })}
        alt={`Claude crab game: ${run.mode}, score ${Math.floor(run.score)}`}
        width={width}
        height={height}
      />
      {Input || Client ? null : <Button key="jump" label="jump" hotkey="k" plain onPress={() => pressJump($)} />}
    </Box>
  )
}

export const register: Register = (on, options) => {
  const ttlMs = (Number(options.cacheTtlMinutes) || 60) * 60000
  const buddy = String(options.buddy ?? 'game')
  S.costume = String(options.costume ?? 'auto')
  on('session.start', async ($, e, next) => {
    await setHandoff($, 'idle')
    stopGameTimer()
    await update($, gameAtom, () => false)
    await update($, runAtom, () => null)
    try {
      // a pane left open by the copy this one replaces
      await $.ui.close({ id: GAME_PANE })
    } catch {
      // none was open
    }
    await trace($, `session.start v${VERSION} options=${JSON.stringify(options)}`)
    try {
      const stored = await $.store.get('best')
      if (typeof stored === 'number') await update($, bestAtom, () => stored)
    } catch {
      // a missing store only means no saved high score
    }
    startTicking($)
    const u = await $.session.usage()
    await update($, usageAtom, () => toUsage(u.context, u.rateLimits, u.cost))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, usageAtom, () => toUsage(e.context, e.rateLimits, e.cost))

    return next(e)
  })

  // a client module that fails on a surface is left out; say why instead of failing silently
  on('ui.fault', async ($, e, next) => {
    await trace($, `fault ${e.surface} ${e.module} ${e.phase}: ${e.reason}`)
    toast($, `status-band: ${e.module} failed on ${e.surface} (${e.phase}): ${e.reason}`)

    return next(e)
  })

  // Space and ↑ play while the game is open and the prompt box is empty, without a click on the game
  // first: the box takes them as edits, so they are read here and not typed. Any other text, and the
  // box behaves as ever. The first few edits while the game is open go to the trace, to show what
  // the box really hands over.
  on('prompt.edit', async ($, e, next) => {
    const isKey = await isGameKey($, e)
    if (S.logged < 12 && e.text === '' && (await read($, gameAtom))) {
      S.logged++
      void trace($, `edit key=${JSON.stringify(e.key ?? null)} input=${JSON.stringify(e.inputText)} game=${isKey ? 'jump' : 'pass'}`)
    }
    if (isKey) {
      await pressKeys($)

      return { text: e.text, cursor: e.cursor }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // the arrows and Tab move the focus ring instead of typing: while the game is open that is a key
  // for the game. It plays, and the ring goes back to the key field, so the next Space is the game's
  // and never a press on Play or Handoff.
  on('ui.focus', async ($, e, next) => {
    if (e.origin.kind !== 'person' || e.element === KEYS || S.gameSurface !== 'svg' || !(await read($, gameAtom))) return next(e)
    const moved = await next(e)
    if (S.logged < 24) {
      S.logged++
      void trace($, `press via=ring ${e.element ?? 'engine'}`)
    }
    if (e.element !== 'play') await pressJump($)
    if (!S.refocus) {
      S.refocus = true
      try {
        await focusGame($)
      } finally {
        S.refocus = false
      }
    }

    return moved
  }).catch(($, e, next) => next(e))

  // the terminal runner posts its high score when a run ends; both games post a close when the
  // person presses q, and the desktop's guidance line posts each jump
  on('ui.message', async ($, e, next) => {
    const data = e.data as { best?: unknown; close?: unknown; jump?: unknown; via?: unknown } | null
    if (data?.close === true) await closeGame($)
    if (data?.jump === true) {
      if (S.logged < 24) {
        S.logged++
        void trace($, `press via=${JSON.stringify(data.via ?? null)}`)
      }
      await pressJump($)
    }
    if (typeof data?.best === 'number' && Number.isFinite(data.best)) await saveBest($, data.best)

    return next(e)
  })

  // the person closed the game's pane from the engine's own mark
  on('ui.close', async ($, e, next) => {
    if (e.id === GAME_PANE) {
      S.isPaneOpen = false
      stopGameTimer()
      await update($, gameAtom, () => false)
      await update($, runAtom, () => null)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    // a cleared chat starts over: its cache countdown no longer applies
    if (e.reason === 'clear') await update($, cacheAtom, () => null)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (buddy !== 'off') startBuddy($, await $.clock.now())

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    stopBuddy()
    const u = e.usage
    if (u) {
      const total = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      const cache: Cache = {
        hitPercent: total > 0 ? Math.round((u.cache_read_input_tokens / total) * 100) : 0,
        readTokens: u.cache_read_input_tokens,
        at: await $.clock.now(),
      }
      await update($, cacheAtom, () => cache)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (buddy !== 'off') startBuddy($, await $.clock.now())

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: GAME_PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    // the terminal's element table holds an empty Svg: only the other surfaces draw one
    if (e.surface !== 'terminal' && 'Svg' in els) {
      const run = await read($, runAtom)

      return run ? sceneView($, els, e.surface, run, e.props.bodyColumns) : <Box />
    }
    const Client = 'Client' in els ? els.Client : null
    if (!Client) {
      return (
        <Box>
          <Text dimColor>The game needs a terminal or the desktop app.</Text>
        </Box>
      )
    }
    const [best, now, signal] = await Promise.all([read($, bestAtom), $.clock.now(), read($, signalAtom)])
    const cols = Math.max(30, Math.min(e.props.bodyColumns, 56))

    return (
      <Box>
        <Client key={`runner-${cols}`} module="./runner.tsx" props={{ best, cols, costume: S.costume, start: Math.floor(now / 60000), signal }} width={cols} />
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const Client = 'Client' in els ? els.Client : null
    // the terminal's element table holds an empty Svg: only the other surfaces draw one
    const isSvg = e.surface !== 'terminal' && 'Svg' in els
    const [usage, cacheRaw, now, phase, best, gameOpen, run, signal] = await Promise.all([
      read($, usageAtom),
      read($, cacheAtom),
      $.clock.now(),
      read($, handoffAtom),
      read($, bestAtom),
      read($, gameAtom),
      read($, runAtom),
      read($, signalAtom),
    ])
    const cache = cacheRaw && typeof cacheRaw.at === 'number' ? cacheRaw : null
    const wide = e.props.bodyColumns >= 100
    const working = e.props.isWorking
    S.bandRows = e.props.maxRows
    S.bandId = e.requestId
    if (!working && S.workTimer) stopBuddy()
    // a reload that brings no session.start still gets its timer and its line in the trace
    startTicking($)
    if (!S.dims.has(e.surface)) {
      S.dims.add(e.surface)
      void trace($, `band v${VERSION} ${e.surface} maxRows=${e.props.maxRows} cols=${e.props.bodyColumns}`)
    }

    // context
    const pct = usage?.ctxPercent
    const tokens = wide && usage?.ctxTokens !== undefined ? `${kilo(usage.ctxTokens)}/${kilo(usage.ctxWindow)}` : ''
    const context = (
      <Box key="ctx" gap={1}>
        <Text dimColor>ctx</Text>
        {pct === undefined ? (
          <Text dimColor>–</Text>
        ) : (
          <Text color={level(pct)} bold>
            {pct}%
          </Text>
        )}
        {tokens ? <Text dimColor>{tokens}</Text> : null}
      </Box>
    )

    // cache countdown: minutes left of the lifetime, restarted by every response
    const left = cache ? Math.max(0, cache.at + ttlMs - now) : 0
    const shown = working ? ttlMs : left
    const minutes = shown > 0 && shown <= 60000 ? '<1' : String(Math.ceil(shown / 60000))
    const cacheColor = shown > 600000 ? 'success' : shown > 120000 ? 'warning' : 'error'
    const hit = cache && wide ? `${cache.hitPercent}% hit` : ''
    const cacheCell = (
      <Box key="cache" gap={1}>
        <Text dimColor>cache</Text>
        {cache ? (
          <Text color={cacheColor} bold>
            {minutes}m
          </Text>
        ) : (
          <Text dimColor>–</Text>
        )}
        {hit ? <Text dimColor>{hit}</Text> : null}
      </Box>
    )

    // limits
    const limitCell = (label: string, l: { percent: number; resetsAt?: string } | undefined) => {
      if (!l) return null
      const reset = wide ? `↻${until(l.resetsAt, now)}` : ''
      return (
        <Box key={label} gap={1}>
          <Text dimColor>{label}</Text>
          <Text color={level(l.percent)} bold>
            {Math.round(l.percent)}%
          </Text>
          {reset ? <Text dimColor>{reset}</Text> : null}
        </Box>
      )
    }

    const limits = usage?.limits ?? []
    const cost = wide && usage?.cost !== undefined ? `$${usage.cost.toFixed(2)}` : ''
    const cells = [
      context,
      cacheCell,
      limitCell('5h', limits.find(l => l.kind === 'five_hour')),
      limitCell('7d', limits.find(l => l.kind === 'seven_day')),
      limitCell('spend', limits.find(l => l.kind === 'spend_limit')),
      cost ? (
        <Text key="cost" dimColor>
          {cost}
        </Text>
      ) : null,
    ].filter(c => c !== null)

    const metrics = (
      <Box key="metrics" columnGap={1} flexWrap="wrap">
        {cells.flatMap((c, i) => (i === 0 ? [c] : [<Text key={`s${i}`} dimColor>·</Text>, c]))}
      </Box>
    )

    // the play control sits beside the handoff slot: it pulses while Claude works, and a press
    // opens or closes the game
    const canPlay = buddy === 'game' && (isSvg || Client !== null) && e.props.bodyColumns >= 30
    const beat = Math.floor(Math.max(0, now - (S.workStart || now)) / BUDDY_TICK_MS)
    const playGlyph = gameOpen ? '■' : working && beat % 2 === 1 ? '▷' : '▶'
    const playLabel = e.props.bodyColumns >= 70 ? `${playGlyph} ${gameOpen ? 'close' : 'play'}` : playGlyph
    const play = canPlay ? (
      <Button key="play" label={playLabel} plain dimColor={!working && !gameOpen} onPress={() => toggleGame($, isSvg)} />
    ) : null

    const busy = phase === 'running'
    const mascotOn = working && !busy && buddy !== 'off'

    const slot = mascotOn ? (
      (() => {
        const m = mascotParts(Math.max(0, now - (S.workStart || now)))
        return (
          <Box key="buddy" width={BUDDY_WIDTH} flexShrink={0}>
            <Text color="claude" bold>
              {m.glyph}
            </Text>
            <Text> </Text>
            <Text dimColor>{m.pre}</Text>
            <Text color="claude" bold>
              {m.hot}
            </Text>
            <Text dimColor>{m.post}</Text>
            <Text dimColor>{m.time}</Text>
            <Text>{' '.repeat(Math.max(0, BUDDY_WIDTH - m.used))}</Text>
          </Box>
        )
      })()
    ) : working || busy ? (
      <Text key="handoff" dimColor>
        {busy ? 'Handing off…' : '⤴ Handoff'}
      </Text>
    ) : (
      <Button
        key="handoff"
        label={phase === 'confirm' ? '✓ Confirm handoff?' : '⤴ Handoff'}
        variant={phase === 'confirm' ? 'primary' : 'secondary'}
        dimColor={phase !== 'confirm'}
        plain
        onPress={() => pressHandoff($)}
      />
    )

    // the game sits under the band when it has the rows for it, else in a pane of its own
    const gameCols = Math.min(e.props.bodyColumns, 56)
    const gameRows = isSvg ? GAME_ROWS.svg : GAME_ROWS.text
    const isGameHere = gameOpen && canPlay && !S.isPaneOpen
    let game: JSX.Element | null = null
    if (isGameHere && isSvg && run) {
      game = <Box key="game-slot" marginTop={e.props.maxRows >= 2 + gameRows ? 1 : 0}>{sceneView($, els, e.surface, run, e.props.bodyColumns)}</Box>
    } else if (isGameHere && Client) {
      game = (
        <Box key="game" marginTop={e.props.maxRows >= 2 + gameRows ? 1 : 0}>
          <Client key={`runner-${gameCols}`} module="./runner.tsx" props={{ best, cols: gameCols, costume: S.costume, start: Math.floor(now / 60000), signal }} width={gameCols} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box>
          <Box flexGrow={1} columnGap={2} flexWrap="wrap">
            {metrics}
          </Box>
          <Box flexShrink={0} columnGap={2}>
            {play}
            {slot}
          </Box>
        </Box>
        {game}
      </Box>
    )
  })
}
