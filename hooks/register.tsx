import { atom, read, update } from 'claude-code'
import type { Elements, Hook, Register } from 'claude-code'

import type { Cache, HandoffPhase, Repo, RunView, Usage } from '../types'
import { act, ahead, deskConfigFor, deskQuiet, FIELD, fresh, lookFor, step } from './crab/game'
import type { Config, Game } from './crab/game'
import { motionSvg, SCENE } from './crab/scene'

type Dollar = Parameters<Hook<'session.start'>>[0]

const usageAtom = atom({ plugin: 'status-band', key: 'usage' } as const, null)
const cacheAtom = atom({ plugin: 'status-band', key: 'cache' } as const, null)
const handoffAtom = atom({ plugin: 'status-band', key: 'handoff' } as const, 'idle')
const bestAtom = atom({ plugin: 'status-band', key: 'best' } as const, 0)
const gameAtom = atom({ plugin: 'status-band', key: 'gameOpen' } as const, false)
const runAtom = atom({ plugin: 'status-band', key: 'game' } as const, null)
// the terminal's game lives in its Client: each press of the prompt's keys bumps this, and the Client acts on a change
const signalAtom = atom({ plugin: 'status-band', key: 'jumpSignal' } as const, 0)

const VERSION = '0.13.18'
// rows the game takes: the terminal's is a header, the five rows of the field and the ground;
// the desktop's the one line of guidance (which is also the click target) and the picture (108 px)
const GAME_ROWS = { text: 7, svg: 9 } as const
// the module's timer is this late (ms) only when the whole app was stalled (asleep): the run then waits
// for it instead of ending behind its back
const STALL_MS = 250
// the picture fills the band: a character cell is about this many pixels wide, and a game unit this many pixels
const SCENE_PX_PER_COL = 8.4
const SCENE_MAX_WIDTH = 1000
const PX_PER_UNIT = 2
// the picture is a plan: this many steps of the run played ahead (7.7 s), carried as animation so the
// display moves it on its own clock; a new one is drawn when a press changes it, or when this few remain
const PLAN_TICKS = 192
const REPLAN_LEFT = 48
// the picture is drawn this far ahead of the moment it is made, to meet the display where it will be
// when the picture arrives (the markup travels, then decodes)
const LEAD_MS = 30
// a press of the same kind this soon after another is the same key arriving twice (the key field and a
// hotkey both hear it) or a held key repeating: it is dropped
const PRESS_GAP_MS = 70
// the run is looked at least this often, whatever the plan says (it is the plan that wakes it)
const HEARTBEAT_MS = 1000
// a redraw of the band that nobody asked the game for restarts a picture on some surfaces: the game
// answers it with a fresh plan, but never more than this often
const REDRAW_MS = 600
// the first this many presses of an opened game go to the trace, with where each came from
const PRESS_TRACE = 80
const GAME_PANE = 'status-band-runner'
// a press this soon after a run ends is a key mashed during the crash, not a wish to retry
const RETRY_GUARD_MS = 450
const TRACE_LINES = 160

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

// the wall-clock time a window ends, in the machine's own zone: 3:40pm (the 5-hour window moves, so the time is the useful part)
const clockAt = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  const hr = d.getHours() % 12 || 12
  return `${hr}:${String(d.getMinutes()).padStart(2, '0')}${d.getHours() < 12 ? 'am' : 'pm'}`
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

// the repo the session sits in, read once when a handoff is written
async function readRepo($: Dollar, dir: string): Promise<Repo | null> {
  // the four fixed, read-only git commands the handoff note needs (a failure of any one leaves its part out)
  const [top, br, sha, st] = await Promise.all([
    $.process.run(['git', 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'], { cwd: dir, timeoutMs: 4000 }).catch(() => null),
    $.process.run(['git', 'branch', '--show-current'], { cwd: dir, timeoutMs: 4000 }).catch(() => null),
    $.process.run(['git', 'rev-parse', '--short', 'HEAD'], { cwd: dir, timeoutMs: 4000 }).catch(() => null),
    $.process.run(['git', 'status', '--porcelain', '-uno'], { cwd: dir, timeoutMs: 4000 }).catch(() => null),
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
  traceQueue: Promise.resolve(),
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
  overAt: 0,
  // which key of the hidden J / K box was drawn last (to trace a change)
  keysDrawn: '',
  pressSeen: 0,
  // how many runs this session has finished: the keys are spelled out for the first game of a session only
  runs: 0,
  // the desktop's run: the hooks module owns it and steps it by the wall clock (`advance`); the picture
  // is a plan made from it (`replan`), and the band is told when either changed (`publish`)
  run: null as Game | null,
  cfg: deskConfigFor(FIELD.normal) as Config,
  // when `run` is the state of (a tick of the run's own clock, kept to the wall clock)
  tickAt: 0,
  planEnd: 0,
  svg: '',
  seq: 0,
  // the plan: when it was made, when it runs out, when the rules say the run ends if nothing is pressed
  lastPlanAt: 0,
  deathAt: Infinity,
  dueAt: 0,
  // the last picture the band drew (its `seq`): a draw of the same one is somebody else's redraw
  drawnSeq: -1,
  lastMove: '',
  lastMoveAt: 0,
  // what the key field held when it last spoke: only text that grew is a key
  field: '',
  pressed: 0,
  isOver: false,
  cols: 100,
  classic: false,
  usage: '',
  isRefreshing: false,
}

// the trace: ~/.claude/status-band-trace.log, the last lines of what the band and its keys did.
// It is kept across sessions (a new session adds to it, never wipes it), so what happened when a key
// did nothing is still there after the next chat starts.
async function trace($: Dollar, line: string) {
  S.traceQueue = S.traceQueue.then(async () => {
    try {
      const [home, now] = await Promise.all([$.env.get('HOME'), $.clock.now()])
      const path = `${home ?? '.'}/.claude/status-band-trace.log`
      let before: string[] = []
      try {
        before = (await $.fs.read(path)).split('\n').filter(Boolean)
      } catch {
        // no log yet
      }
      const at = new Date(now).toISOString().slice(11, 23)
      await $.fs.write(path, `${[...before, `${at} ${line}`].slice(-TRACE_LINES).join('\n')}\n`)
    } catch {
      // the trace is a debugging aid: the band never depends on it
    }
  })
  await S.traceQueue
}

// the countdowns move on their own: one slow redraw timer per load of the module
function startTicking($: Dollar) {
  if (S.ticking) return
  S.ticking = true
  // not while a run plays: a redraw is what the picture is built not to need
  $.clock.every(20000, () => {
    if (S.run?.mode !== 'play') $.ui.invalidate('ui.render')
  })
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
  if (!S.workTimer) {
    S.workTimer = $.clock.every(BUDDY_TICK_MS, () => {
      if (S.run?.mode !== 'play') $.ui.invalidate('ui.render')
    })
  }
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
  S.dueAt = 0
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

// ---- the desktop's game -----------------------------------------------------------------------
// The hooks module owns the run (`S.run`) and keeps it to the wall clock: one step per `tickMs`, the
// owed steps made up when something looks at it (`advance`). The picture is not redrawn per step: it
// is a plan, the run played ahead by the same rules and carried as animation (hooks/crab/scene.ts),
// so the display moves everything on its own clock and a late or uneven redraw cannot make it
// stutter. The score is drawn into it too. A new plan is made (`replan`) only when something changes
// it: a press, the plan running low, the end of the run. Nothing wakes the module between those but
// one timer, set for the earliest of them (`arm`), so a run at rest costs nothing.

// bring the run up to the wall clock, one step per `tickMs`; true when the app had stalled meanwhile
function advance(now: number): boolean {
  const g = S.run
  if (!g || g.mode !== 'play') return false
  const ms = S.cfg.tickMs
  let n = g
  const upTo = (until: number) => {
    while (n.mode === 'play' && S.tickAt + ms <= until) {
      n = step(n, S.cfg)
      S.tickAt += ms
    }
  }
  // the one timer is late by more than a moment: the app was stalled, and the run waits for it
  const late = S.dueAt > 0 ? now - S.dueAt : 0
  const isStalled = late > STALL_MS
  if (isStalled) {
    upTo(S.dueAt)
    S.tickAt += late
  } else {
    upTo(now)
  }
  S.run = n
  if (n.mode === 'over') S.overAt = S.tickAt

  return isStalled
}

// make the picture for the run as it is: a still, or (while it plays) the plan from the moment the
// picture will be on screen
function replan(now: number) {
  const g = S.run
  if (!g) return
  const cfg = S.cfg
  const ms = cfg.tickMs
  const size = { width: cfg.width * PX_PER_UNIT, height: SCENE.h * PX_PER_UNIT }
  S.lastPlanAt = now
  if (g.mode !== 'play' || S.classic) {
    S.svg = motionSvg({ states: [g], phase: 0, overAge: g.mode === 'over' ? Math.max(0, (now - S.overAt) / ms) : undefined, hints: !deskQuiet(S.runs) }, cfg, size)
    S.planEnd = 0
    S.deathAt = Infinity

    return
  }
  const owed = Math.max(0, (now + LEAD_MS - S.tickAt) / ms)
  const whole = Math.floor(owed)
  const run = ahead(g, cfg, whole + PLAN_TICKS)
  const phase = owed - whole
  S.svg = motionSvg({ states: run.slice(whole), phase, hints: !deskQuiet(S.runs) }, cfg, size)
  S.planEnd = now + LEAD_MS + (PLAN_TICKS - phase) * ms
  const end = run.findIndex(r => r.mode === 'over')
  S.deathAt = end < 0 ? Infinity : S.tickAt + end * ms
}

async function publish($: Dollar) {
  const game = S.run
  if (!game) return
  S.seq++
  const view: RunView = { game, svg: S.svg, units: S.cfg.width, seq: S.seq }
  await update($, runAtom, () => view)
}

// the one timer: for the earliest of the end of the run (if nothing is pressed), the plan running low,
// and a look every second
function arm($: Dollar, now: number) {
  stopGameTimer()
  if (S.run?.mode !== 'play') return
  const ms = S.cfg.tickMs
  const due = S.classic ? now + ms : Math.min(S.deathAt + ms / 2, S.planEnd - LEAD_MS - REPLAN_LEFT * ms, now + HEARTBEAT_MS)
  const wait = Math.max(4, due - now)
  S.dueAt = now + wait
  S.gameTimer = $.clock.after(wait, () => void tickGame($))
}

// a run just ended: show the last picture, keep the best score
async function finish($: Dollar, now: number) {
  if (S.isOver) return
  S.isOver = true
  S.runs += 1
  stopGameTimer()
  replan(now)
  await publish($)
  if (S.run) await saveBest($, S.run.best)
  void trace($, `over score=${Math.floor(S.run?.score ?? 0)} cause=${S.run?.cause ?? ''} tick=${S.run?.tick ?? 0}`)
}

async function tickGame($: Dollar) {
  if (S.isGameBusy) return
  S.isGameBusy = true
  try {
    S.gameTimer = null
    if (!S.run || S.run.mode !== 'play') return
    const now = await $.clock.now()
    const stalled = advance(now)
    // advancing is what ends a run: read S.run again, it is not what the check above narrowed it to
    if ((S.run as Game | null)?.mode === 'over') {
      await finish($, now)
      return
    }
    // the plan is renewed while some is left, or at every step in the classic mode
    if (stalled || S.classic || now + LEAD_MS >= S.planEnd - REPLAN_LEFT * S.cfg.tickMs) {
      replan(now)
      await publish($)
    }
    arm($, now)
  } finally {
    S.isGameBusy = false
  }
}

// a press starts a run, retries after one, jumps, or ducks. A press in the instant a run ends is the
// crash happening under the person's fingers, not a request for another: it is ignored. `via` is where
// it came from, for the trace.
async function press($: Dollar, move: 'jump' | 'duck' = 'jump', via = '?') {
  const now = await $.clock.now()
  const before = S.run
  if (!before) return
  const note = (what: string) => {
    if (S.pressed >= PRESS_TRACE) return
    S.pressed++
    void trace($, `press ${what} via=${via} move=${move} mode=${before.mode}`)
  }
  // one key arrives by more than one road (the field and a hotkey), and a held key repeats
  if (move === S.lastMove && now - S.lastMoveAt < PRESS_GAP_MS) {
    note('dropped(repeat)')
    return
  }
  S.lastMove = move
  S.lastMoveAt = now
  advance(now)
  // advancing is what ends a run, and S.run is the module's to move: read it again
  const g = S.run as Game | null
  if (!g) return
  if (before.mode === 'play' && g.mode === 'over') {
    await finish($, now)
    return
  }
  if (g.mode === 'over' && now - S.overAt < RETRY_GUARD_MS) {
    note('dropped(crash)')
    return
  }
  const next = act(g, S.cfg, move)
  if (next === g) {
    note('nothing')
    return
  }
  note(g.mode === 'play' ? `jump=${g.jump}->${next.jump} duck=${next.duck} queued=${next.queued}` : 'start')
  const isStart = g.mode !== 'play'
  S.run = next
  if (isStart) {
    S.tickAt = now
    S.isOver = false
  }
  replan(now)
  arm($, now)
  await publish($)
}

// the keys that play, read at the prompt box: it owns the keyboard, so a key reaches a game that
// was never clicked only this way. Space and ↑ always; k only while a run is live, so a draft that
// starts with k is never in the way while the game waits. Only an empty box is ever touched.
const SPACE_KEYS = new Set([' ', 'space', 'up', 'w'])
const DUCK_KEYS = new Set(['down'])

// which move a key at the prompt box is, or null when it is just typing
async function gameKey($: Dollar, e: { text: string; inputText: string; key?: { key: string; ctrl?: true; meta?: true } }): Promise<'jump' | 'duck' | null> {
  if (e.text !== '' || e.key?.ctrl || e.key?.meta) return null
  if (!(await read($, gameAtom))) return null
  const k = e.key?.key
  // a space with no key named (folded into a burst) is still only blank
  if (k === undefined) return e.inputText !== '' && e.inputText.trim() === '' ? 'jump' : null
  if (SPACE_KEYS.has(k)) return e.inputText.trim() === '' ? 'jump' : null
  if (DUCK_KEYS.has(k)) return e.inputText.trim() === '' ? 'duck' : null
  if (k === 'k' || k === 'j') return S.gameSurface === 'svg' && S.run?.mode === 'play' ? (k === 'k' ? 'jump' : 'duck') : null

  return null
}

async function pressKeys($: Dollar, move: 'jump' | 'duck') {
  if (S.gameSurface === 'svg') await press($, move, 'box')
  else await update($, signalAtom, n => (n ?? 0) + 1)
}

async function closeGame($: Dollar) {
  stopGameTimer()
  S.run = null
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
  S.pressed = 0
  S.pressSeen = 0
  S.lastMove = ''
  S.drawnSeq = -1
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
  if (isSvg) {
    // the field is as wide as the band, so the picture fills it
    const units = Math.max(FIELD.min, Math.min(FIELD.max, Math.round(Math.min(SCENE_MAX_WIDTH, S.cols * SCENE_PX_PER_COL) / PX_PER_UNIT)))
    S.cfg = deskConfigFor(units)
    S.run = fresh(best, 1 + (now % 99991), 'ready', lookFor(S.costume), S.cfg)
    S.isOver = false
    replan(now)
    await publish($)
  }
  await update($, gameAtom, () => true)
}

// the band is being drawn with the picture it drew last: the draw was somebody else's (a turn ended,
// a limit moved, the window changed). On some surfaces that restarts an animated picture from its first
// moment, so the game answers with a plan from now, once the draw is over (an atom is not written from
// inside a draw), and never more than every REDRAW_MS.
function drawn($: Dollar, view: RunView | null, now: number) {
  if (!view || S.gameSurface !== 'svg') return
  if (view.seq !== S.drawnSeq) {
    S.drawnSeq = view.seq
    return
  }
  if (S.run?.mode !== 'play' || S.classic || S.isRefreshing || now - S.lastPlanAt < REDRAW_MS) return
  S.isRefreshing = true
  void $.clock.after(0, () => void refresh($))
}

async function refresh($: Dollar) {
  try {
    const now = await $.clock.now()
    if (!S.run || S.run.mode !== 'play') return
    advance(now)
    if ((S.run as Game | null)?.mode === 'over') {
      await finish($, now)
      return
    }
    void trace($, 'redraw: plan renewed')
    replan(now)
    arm($, now)
    await publish($)
  } finally {
    S.isRefreshing = false
  }
}

type VectorEls = Elements['desktop'] | Elements['vscode'] | Elements['mobile']

// The picture of the run, and nothing else drawn: no key field, no row of hints (the first game's
// hint, `J duck · K jump`, is drawn inside the picture under the scoreboard, so the band is the same
// size in every game). The desktop only hands the keys to the game through a Button's hotkey while the
// band holds the focus (after a click on Play it does), so the J and K buttons are always in the tree:
// they ARE the keys (K starts, retries and jumps; J ducks). They are drawn in a Box with no size,
// clipped, at the picture's corner: nothing shows (a visible hotkey is drawn as a chip) but they stay
// wholly inside the band, which is where the engine arms a hotkey (one scrolled out of the window is not).
function sceneView($: Dollar, els: VectorEls, view: RunView, bodyColumns: number) {
  const { Box, Button, Svg } = els
  const width = Math.max(150, Math.min(SCENE_MAX_WIDTH, Math.floor(bodyColumns * SCENE_PX_PER_COL)))
  const height = Math.round((width * SCENE.h) / view.units)
  // The buttons are drawn afresh once the session's first game is over (a new key, so the engine
  // mounts new ones): the ones drawn while that game was opened stopped answering their hotkeys after
  // it (0.13.9 trace: no press at all after the first game), while ones drawn after it answered for
  // every game since (0.13.7 trace). Later games keep the same buttons.
  const keysKey = S.runs >= 1 ? 'keys-hidden-2' : 'keys-hidden'
  if (keysKey !== S.keysDrawn) {
    S.keysDrawn = keysKey
    void trace($, `keys drawn ${keysKey} runs=${S.runs}`)
  }

  return (
    <Box key="game" flexDirection="column" position="relative">
      <Box key={keysKey} position="absolute" top={0} left={0} width={0} height={0} overflow="hidden">
        <Button key="duck" label="duck" hotkey="j" plain dimColor onPress={() => press($, 'duck', 'button')} />
        <Button key="jump" label="jump" hotkey="k" plain dimColor onPress={() => press($, 'jump', 'button')} />
      </Box>
      <Svg
        key="scene"
        source={view.svg}
        alt={`Claude crab game: ${view.game.mode}`}
        width={width}
        height={height}
      />
    </Box>
  )
}

export const register: Register = (on, options) => {
  const ttlMs = (Number(options.cacheTtlMinutes) || 60) * 60000
  const buddy = String(options.buddy ?? 'game')
  S.costume = String(options.costume ?? 'auto')
  S.classic = String(options.motion ?? 'smooth') === 'classic'
  on('session.start', async ($, e, next) => {
    await setHandoff($, 'idle')
    stopGameTimer()
    S.run = null
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
    S.runs = 0
    S.keysDrawn = ''
    startTicking($)
    const u = await $.session.usage()
    await update($, usageAtom, () => toUsage(u.context, u.rateLimits, u.cost))

    return next(e)
  })

  // the same numbers again are not a reason to redraw the band
  on('session.measure', async ($, e, next) => {
    const usage = toUsage(e.context, e.rateLimits, e.cost)
    const same = JSON.stringify(usage)
    if (same !== S.usage) {
      S.usage = same
      await update($, usageAtom, () => usage)
    }

    return next(e)
  })

  // Space and ↑ play while the game is open and the prompt box is empty, without a click on the game
  // first: the box takes them as edits, so they are read here and not typed. Any other text, and the
  // box behaves as ever. The first few edits while the game is open go to the trace, as a game key or
  // a pass: never the text itself.
  on('prompt.edit', async ($, e, next) => {
    const move = await gameKey($, e)
    if (S.logged < 12 && e.text === '' && (await read($, gameAtom))) {
      S.logged++
      void trace($, move ? `edit game key=${move}` : 'edit passed to the prompt')
    }
    if (move) {
      await pressKeys($, move)

      return { text: e.text, cursor: e.cursor }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // the terminal runner posts its high score when a run ends; both games post a close when the
  // person presses q, and the desktop's guidance line posts each jump
  // every press of one of this plugin's own controls goes to the trace (the first few), so a dead key
  // can be told from a key that never reached the plugin
  on('ui.press', async ($, e, next) => {
    if (S.gameSurface === 'svg' && e.plugin !== undefined && e.plugin.startsWith('status-band') && S.pressSeen < 40) {
      S.pressSeen++
      void trace($, `ui.press element=${e.element ?? '-'}`)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.message', async ($, e, next) => {
    const data = e.data as { best?: unknown; close?: unknown; jump?: unknown; duck?: unknown; via?: unknown } | null
    if (data?.close === true) await closeGame($)
    if (data?.jump === true) {
      if (S.logged < 24) {
        S.logged++
        void trace($, `press via=${JSON.stringify(data.via ?? null)}`)
      }
      await press($, data.duck === true ? 'duck' : 'jump', 'message')
    }
    if (typeof data?.best === 'number' && Number.isFinite(data.best)) await saveBest($, data.best)

    return next(e)
  })

  // the person closed the game's pane from the engine's own mark
  on('ui.close', async ($, e, next) => {
    if (e.id === GAME_PANE) {
      S.isPaneOpen = false
      stopGameTimer()
      S.run = null
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
      drawn($, run, await $.clock.now())

      return run ? sceneView($, els, run, e.props.bodyColumns) : <Box />
    }
    if (!('Client' in els)) {
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
        <els.Client key={`runner-${cols}`} module="./runner.tsx" props={{ best, cols, costume: S.costume, signal }} width={cols} />
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
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
    S.cols = e.props.bodyColumns
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
    // the 5-hour window has no fixed schedule, so it always shows the time it ends (and the wait when there is room);
    // the weekly one keeps its countdown on wide bands only
    const limitCell = (label: string, l: { percent: number; resetsAt?: string } | undefined) => {
      if (!l) return null
      const wait = until(l.resetsAt, now)
      const at = label === '5h' ? clockAt(l.resetsAt) : ''
      const reset = at ? `↻${at}${wide && wait ? ` (${wait})` : ''}` : wide && wait ? `↻${wait}` : ''
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
    const canPlay = buddy === 'game' && (isSvg || 'Client' in els) && e.props.bodyColumns >= 30
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
        // while a run plays the band is left alone: the mascot holds still (and the clock with it)
        const quiet = run?.game.mode === 'play'
        const m = quiet ? null : mascotParts(Math.max(0, now - (S.workStart || now)))
        return (
          <Box key="buddy" width={BUDDY_WIDTH} flexShrink={0}>
            <Text color="claude" bold>
              {m ? m.glyph : '✻'}
            </Text>
            <Text> </Text>
            {m ? (
              <Box>
                <Text dimColor>{m.pre}</Text>
                <Text color="claude" bold>
                  {m.hot}
                </Text>
                <Text dimColor>{m.post}</Text>
                <Text dimColor>{m.time}</Text>
                <Text>{' '.repeat(Math.max(0, BUDDY_WIDTH - m.used))}</Text>
              </Box>
            ) : (
              <Text dimColor>working…</Text>
            )}
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
      drawn($, run, now)
      game = <Box key="game-slot" marginTop={e.props.maxRows >= 2 + gameRows ? 1 : 0}>{sceneView($, els, run, e.props.bodyColumns)}</Box>
    } else if (isGameHere && 'Client' in els) {
      game = (
        <Box key="game" marginTop={e.props.maxRows >= 2 + gameRows ? 1 : 0}>
          <els.Client key={`runner-${gameCols}`} module="./runner.tsx" props={{ best, cols: gameCols, costume: S.costume, signal }} width={gameCols} />
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
