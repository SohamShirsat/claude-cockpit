import { FIRST_GAME_NOTES, FIRST_GAME_READY, NOTES } from './crab/game'
import { describe, expect, mock, test } from 'claude-code/testing'

import type { Engine } from 'claude-code/testing'

describe('status-band', () => {
  test('draws a row on the terminal and desktop without any measurement', async ($, on) => {
    on('clock.now', () => ({ value: Date.parse('2026-10-08T00:00:00Z') }))
    on('session.cwd', () => ({ value: '/work/parent' }))
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'status-band',
        surface,
        component: 'AbovePrompt',
        props: {
          hasSurvey: false,
          isWorking: false,
          maxRows: 6,
          bodyColumns: 120,
          scroll: { bodyRows: 5 },
          view: {},
        },
      } as never)
      expect(await ui.drawn()).toMatchObject({ type: 'Box' })
      await ui.unmount()
    }
  })
})

describe('cache timer', () => {
  test('counts down from 60 minutes to 0', async ($, on) => {
    let now = Date.parse('2026-10-08T00:00:00Z')
    on('clock.now', () => ({ value: now }))
    on('session.cwd', () => ({ value: '/work/parent' }))
    on('turn.complete', (_$, e) => ({ text: e.answer, usage: e.usage }))
    await $.turn.complete({
      answer: 'ok',
      durationMs: 10,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
      usage: {
        model: 'm',
        input_tokens: 100,
        output_tokens: 10,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 0,
      },
    } as never)

    const mount = () =>
      $.ui.mount({
        plugin: 'status-band',
        surface: 'terminal',
        component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { bodyRows: 5 }, view: {} },
      } as never)

    now += 2 * 60000
    let ui = await mount()
    expect(await ui.find({ type: 'Text', text: /58m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /90% hit/ })).toBeDefined()
    await ui.unmount()

    now += 10 * 60000
    ui = await mount()
    expect(await ui.find({ type: 'Text', text: /48m/ })).toBeDefined()
    await ui.unmount()

    now += 70 * 60000
    ui = await mount()
    expect(await ui.find({ type: 'Text', text: /^0m$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /cold|warm/ })).toBeUndefined()
    await ui.unmount()
  })
})

describe('handoff button', () => {
  const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { bodyRows: 5 }, view: {} }

  test('asks to confirm, then writes the note, clears and fills the prompt', async ($, on) => {
    const order: string[] = []
    let filled = ''
    on('clock.now', () => ({ value: Date.parse('2026-10-08T10:30:00Z') }))
    on('session.cwd', () => ({ value: '/work/parent' }))
    on('env.get', () => ({ value: '/home/x' }))
    on('fs.write', (_$, e) => {
      if (String(e.path).includes('/handoffs/')) order.push('write')
      return { value: undefined }
    })
    on('model.fork', () => {
      order.push('fork')
      return {
        value: {
          isAnswered: true as const,
          text: '**Goal** ship it',
          usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 1, cache_creation_input_tokens: 0 },
        },
      }
    })
    on('command.run', () => {
      order.push('clear')
      return { text: '' }
    })
    on('session.turns', () => ({ value: 0 }))
    on('prompt.fill', (_$, e) => {
      order.push('fill')
      filled = e.text
      return { isFilled: true, text: e.text, cursor: e.text.length }
    })
    on('ui.toast', () => ({ value: undefined }))

    const ui = await $.ui.mount({ plugin: 'status-band', surface: 'terminal', component: 'AbovePrompt', props } as never)
    expect(await ui.find({ type: 'Button', text: /Handoff/ })).toBeDefined()

    await ui.press({ key: 'handoff' })
    expect(order).toEqual([])
    expect(await ui.find({ type: 'Button', text: /Confirm/ })).toBeDefined()

    await ui.press({ key: 'handoff' })
    expect(order).toEqual(['fork', 'write', 'clear', 'fill'])
    expect(filled).toContain('**Goal** ship it')
    expect(filled).toContain('# Handoff 2026-10-08 10:30')
    await ui.unmount()
  })
  test('never clears the chat when the note could not be written', async ($, on) => {
    const order: string[] = []
    on('clock.now', () => ({ value: 0 }))
    on('session.cwd', () => ({ value: '/work/parent' }))
    on('env.get', () => ({ value: '/home/x' }))
    on('model.fork', () => ({
      value: {
        isAnswered: false as const,
        reason: 'api-error' as const,
        status: 529,
        error: 'overloaded',
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      } as never,
    }))
    on('command.run', () => {
      order.push('clear')
      return { text: '' }
    })
    on('ui.toast', () => ({ value: undefined }))

    const ui = await $.ui.mount({ plugin: 'status-band', surface: 'terminal', component: 'AbovePrompt', props } as never)
    await ui.press({ key: 'handoff' })
    await ui.press({ key: 'handoff' })
    expect(order).toEqual([])
    expect(await ui.find({ type: 'Button', text: /Handoff/ })).toBeDefined()
    await ui.unmount()
  })
})

type Run = { argv: string[]; init?: { cwd?: string } }
type Fake = { root: string; branch: string; dirty?: number }

const SURFACES = ['terminal', 'desktop'] as const
const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '' } })
const fail = (stderr = 'nope') => ({ value: { exitCode: 1, stdout: '', stderr } })

// a git that answers for the fake repos by the directory it is run in
const fakeRun = (repos: Fake[]) => (_$: unknown, e: Run) => {
  const a = e.argv.join(' ')
  const cwd = e.init?.cwd ?? ''
  const repo = repos.find(r => cwd === r.root || cwd.startsWith(`${r.root}/`))
  if (!repo) return fail('fatal: not a git repository')
  if (a.includes('--show-toplevel')) return ok(`${repo.root}\n${repo.root}/.git\n${repo.root}/.git\n`)
  if (a.includes('branch --show-current')) return ok(`${repo.branch}\n`)
  if (a.includes('status --porcelain')) return ok(' M a.ts\n'.repeat(repo.dirty ?? 0))
  return ok('abc1234\n')
}

// one session: its folder, the repos on disk, and what the band's calls on `$` answer
const world = (on: (event: string, hook: (...args: never[]) => unknown) => unknown, cwd: string, repos: Fake[], withClock = true) => {
  const seen = { toasts: [] as string[], opened: [] as string[], closed: [] as string[], traced: '' }
  const hook = on as (event: string, hook: (...args: any[]) => unknown) => unknown
  if (withClock) hook('clock.now', () => ({ value: 0 }))
  hook('session.cwd', () => ({ value: cwd }))
  hook('env.get', () => ({ value: '/home/x' }))
  // the trace file is read back before each line is added, as the band keeps it across sessions
  hook('fs.read', (_$: unknown, e: { path?: string }) => {
    if (e.path?.endsWith('status-band-trace.log') && seen.traced) return { value: seen.traced }
    return { deny: 'ENOENT' }
  })
  hook('fs.write', (_$: unknown, e: { path?: string; text?: string }) => {
    if (e.path?.endsWith('status-band-trace.log')) seen.traced = String(e.text)
    return { value: undefined }
  })
  hook('process.run', fakeRun(repos))
  hook('ui.toast', (_$: unknown, e: { text?: string } | string) => {
    seen.toasts.push(typeof e === 'string' ? e : String(e.text ?? JSON.stringify(e)))
    return { value: undefined }
  })
  hook('ui.open', (_$: unknown, e: { id: string }) => {
    seen.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  hook('ui.close', (_$: unknown, e: { id: string }) => {
    seen.closed.push(e.id)
    return { value: undefined }
  })
  hook('prompt.edit', editor)
  hook('tool.call', () => ({ result: {}, text: '' }))
  hook('turn.complete', (_$: unknown, e: { answer: string; usage: unknown }) => ({ text: e.answer, usage: e.usage }))
  return seen
}

const band = ($: Engine, surface: (typeof SURFACES)[number], props: Record<string, unknown> = {}) =>
  $.ui.mount({
    plugin: 'status-band',
    surface,
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 160, scroll: { bodyRows: 11 }, view: {}, ...props } as never,
  })

const missing = async (find: () => Promise<unknown>) => {
  try {
    return (await find()) === undefined
  } catch (err) {
    return String(err).includes('no Client keyed')
  }
}

describe('while working', () => {
  const props = { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 11 }, view: {} }
  const mount = ($: Engine, p = props) =>
    $.ui.mount({ plugin: 'status-band', surface: 'terminal', component: 'AbovePrompt', props: p as never })

  test('swaps the handoff text for an animated mascot in the same slot', async ($, on) => {
    on('session.cwd', () => ({ value: '/work/parent' }))
    on('clock.now', () => ({ value: 1000 }))
    const ui = await mount($)
    expect(await ui.find({ type: 'Button', text: /Handoff/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /⤴ Handoff/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /0:0\d/ })).toBeDefined()
    await ui.unmount()
  })
})



// the engine's own editor, beneath the plugins: the splice applied as the box would show it
const editor = (_$: unknown, e: { text: string; start: number; end: number; inputText: string }) => ({
  text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end),
  cursor: e.start + e.inputText.length,
})
const edit = ($: Engine, e: unknown) =>
  ($ as unknown as { prompt: { edit: (e: unknown) => Promise<{ text: string; cursor: number }> } }).prompt.edit(e)

// what the editor hands `prompt.edit` for one key at the prompt box
const typed = (key: string, text = '') => ({
  origin: { kind: 'composer' as const },
  key: { key },
  text,
  cursor: text.length,
  start: text.length,
  end: text.length,
  inputText: key === 'up' || key === 'down' ? '' : key,
})

describe('game (terminal: half-block pixels in a Client)', () => {
  for (const surface of ['terminal'] as const) {
    test(`the play control opens it, a run is played, q closes it (${surface})`, async ($, on) => {
      world(on as never, '/work/none', [])
      const ui = await band($, surface, { isWorking: true, bodyColumns: 100 })
      const runner = (text: RegExp) => ui.find({ type: 'Text', text, in: 'runner-56' } as never)

      expect(await ui.find({ type: 'Button', key: 'play', text: /play/ })).toBeDefined()
      expect(await missing(() => runner(/to start/))).toBe(true)

      await ui.press({ key: 'play' })
      expect(await runner(/to start/)).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'play', text: /close/ })).toBeDefined()

      await ui.key({ key: ' ', in: 'runner-56' } as never)
      await ui.advance(500)
      expect(await runner(/score 00[0-9][0-9]/)).toBeDefined()

      // never jumping: the first obstacle ends the run
      await ui.advance(8000)
      expect(await runner(/game over/)).toBeDefined()

      await ui.key({ key: 'q', in: 'runner-56' } as never)
      expect(await missing(() => runner(/game over/))).toBe(true)
      expect(await ui.find({ type: 'Button', key: 'play', text: /play/ })).toBeDefined()
      await ui.unmount()
    })

    test(`it stays open once the turn ends, and the control closes it (${surface})`, async ($, on) => {
      world(on as never, '/work/none', [])
      let ui = await band($, surface, { isWorking: true, bodyColumns: 100 })
      await ui.press({ key: 'play' })
      await ui.unmount()

      ui = await band($, surface, { isWorking: false, bodyColumns: 100 })
      expect(await ui.find({ type: 'Text', text: /to start/, in: 'runner-56' } as never)).toBeDefined()
      await ui.press({ key: 'play' })
      expect(await missing(() => ui.find({ type: 'Text', text: /to start/, in: 'runner-56' } as never))).toBe(true)
      await ui.unmount()
    })

    test(`a band too short for it opens it in a pane instead (${surface})`, async ($, on) => {
      const seen = world(on as never, '/work/none', [])
      const ui = await band($, surface, { isWorking: true, bodyColumns: 100, maxRows: 4, scroll: { bodyRows: 3 } })
      await ui.press({ key: 'play' })
      expect(seen.opened).toEqual(['status-band-runner'])
      expect(await missing(() => ui.find({ type: 'Text', text: /to start/, in: 'runner-56' } as never))).toBe(true)

      const pane = await $.ui.mount({
        plugin: 'status-band',
        surface,
        component: 'Pane',
        requestId: 'status-band-runner',
        props: { title: 'Claude runner', isFocused: false, bodyColumns: 60, placement: 'inline', scroll: { bodyRows: 6 }, view: {} } as never,
      })
      expect(await pane.find({ type: 'Text', text: /to start/, in: 'runner-56' } as never)).toBeDefined()
      await pane.unmount()

      await ui.press({ key: 'play' })
      expect(seen.closed).toEqual(['status-band-runner'])
      expect(await ui.find({ type: 'Button', key: 'play', text: /play/ })).toBeDefined()
      await ui.unmount()
    })
  }

  for (const surface of ['terminal'] as const) {
    test(`the runner is the crab, wearing the costume that was asked for (${surface})`, async ($, on) => {
      world(on as never, '/work/none', [])
      const ui = await band($, surface, { isWorking: true, bodyColumns: 100 })
      await ui.press({ key: 'play' })
      const inRunner = (text: RegExp) => ui.find({ type: 'Text', text, in: 'runner-56' } as never)

      // the clock reads 0, so the auto setting starts on the plain crab: clay body in half blocks
      expect(await inRunner(/plain · grab/)).toBeDefined()
      expect(await inRunner(/[▀▄█]/)).toMatchObject({ props: { color: '#D97757' } })
      expect(await inRunner(/[✻✕]/)).toBeDefined()
      await ui.press({ key: 'play' })
      await ui.unmount()
    })
  }

  test('space at the prompt box starts and jumps the terminal game as well', async ($, on) => {
    world(on as never, '/work/none', [])
    const ui = await band($, 'terminal', { isWorking: true, bodyColumns: 100 })
    await ui.press({ key: 'play' })
    const inRunner = (text: RegExp) => ui.find({ type: 'Text', text, in: 'runner-56' } as never)
    expect(await inRunner(/to start/)).toBeDefined()

    const kept = await edit($, typed(' ') as never)
    expect(kept.text).toBe('')
    await ui.advance(300)
    expect(await inRunner(/score 00/)).toBeDefined()
    await ui.press({ key: 'play' })
    await ui.unmount()
  })

  test('a costume picked in the settings is the one that runs, and it stays through retries', { options: { costume: 'chef' } }, async ($, on) => {
    world(on as never, '/work/none', [])
    const ui = await band($, 'terminal', { isWorking: true, bodyColumns: 100 })
    await ui.press({ key: 'play' })
    const inRunner = (text: RegExp) => ui.find({ type: 'Text', text, in: 'runner-56' } as never)
    expect(await inRunner(/chef · grab/)).toBeDefined()

    await ui.key({ key: ' ', in: 'runner-56' } as never)
    await ui.advance(100 * 90)
    expect(await inRunner(/game over/)).toBeDefined()
    await ui.key({ key: ' ', in: 'runner-56' } as never)
    await ui.advance(100)
    expect(await inRunner(/score/)).toBeDefined()
    await ui.key({ key: 'q', in: 'runner-56' } as never)
    await ui.unmount()
  })

  test('a well-timed jump clears the first obstacle', async ($, on) => {
    world(on as never, '/work/none', [])
    const ui = await band($, 'terminal', { isWorking: true, bodyColumns: 100 })
    const runner = (text: RegExp) => ui.find({ type: 'Text', text, in: 'runner-56' } as never)
    await ui.press({ key: 'play' })
    await ui.key({ key: ' ', in: 'runner-56' } as never)
    // a bug spawns at tick 16 at column 55 and reaches the crab's body (col 5) 50 ticks later;
    // the jump has the crab two pixels up or more from its second tick to its twelfth
    await ui.advance(60 * 60)
    await ui.key({ key: 'up', in: 'runner-56' } as never)
    await ui.advance(60 * 14)
    expect(await runner(/game over/)).toBeUndefined()
    expect(await runner(/score/)).toBeDefined()
    await ui.press({ key: 'play' })
    await ui.unmount()
  })
})

describe('game (desktop: a vector scene, one line of guidance that takes the keys, and a run the hooks module owns)', () => {
  let engine: Engine
  const open = async ($: Engine, on: unknown, surface: 'desktop' | 'vscode' | 'mobile' = 'desktop', props: Record<string, unknown> = {}, stored: Record<string, unknown> = {}) => {
    engine = $
    const clock = mock.clock(on as never)
    mock.store(on as never, stored)
    const seen = world(on as never, '/work/none', [], false)
    const all = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 11 }, view: {}, ...props }
    const ui = (await $.ui.mount({ plugin: 'status-band', surface, component: 'AbovePrompt', props: all as never })) as Awaited<ReturnType<typeof band>>
    await ui.press({ key: 'play' })

    return { clock, seen, ui }
  }
  const svg = async (ui: Awaited<ReturnType<typeof band>>) => {
    const el = await ui.find({ type: 'Svg' })
    return String((el as { props?: { source?: string } } | undefined)?.props?.source ?? '')
  }

  // a run that has ended is a still that says so; the line is quiet then, so the picture is the way to tell
  const ended = async (ui: Awaited<ReturnType<typeof band>>) => {
    const source = await svg(ui)

    return source.includes('GAME OVER') && !source.includes('dur="7.68s"')
  }

  // the first game says its keys inside the picture, in the strip beside the scoreboard (the ready text, the first notes)
  const line = async (ui: Awaited<ReturnType<typeof band>>) => {
    const source = await svg(ui)

    return [FIRST_GAME_READY, ...Object.values(FIRST_GAME_NOTES)].some(t => source.includes(t)) ? 'hints' : ''
  }
  const hiddenRow = async (ui: Awaited<ReturnType<typeof band>>) => (await ui.find({ type: 'Box', key: 'keys-hidden' })) ?? (await ui.find({ type: 'Box', key: 'keys-hidden-2' }))
  // a key at the prompt box: Space is a jump (or a start, or a retry)
  const typeKey = (_ui: Awaited<ReturnType<typeof band>>, _text: string) => edit(engine, typed(' ') as never)

  test('play opens the picture of the crab and, for the first game, one row of key hints under it', async ($, on) => {
    const { ui } = await open($, on)
    const source = await svg(ui)
    expect(source).toContain('<svg')
    expect(source).toContain('#D97757')
    // the picture and nothing above or under it; no key field
    expect(await line(ui)).toBe('hints')
    expect(await ui.find({ type: 'Input' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'jump' })).toMatchObject({ props: { hotkey: 'k' } })
    expect(await ui.find({ type: 'Text', text: /any key|enter/i })).toBeUndefined()
    await ui.press({ key: 'play' })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  })

  test('a key typed in the field starts the run, the picture moves, and it ends on the first bug', async ($, on) => {
    const { clock, ui } = await open($, on)
    const before = await svg(ui)
    await typeKey(ui, ' ')
    await clock.advance(40 * 12)
    expect(await line(ui)).toBe('hints')
    expect(await svg(ui)).not.toBe(before)

    // never jumping: a bug reaches the crab
    await clock.advance(40 * 200)
    expect(await ended(ui)).toBe(true)
    // belly up and grey: the crab is drawn rotated
    expect(await svg(ui)).toContain('180 15 18')

    // a press retries; q closes it all
    await typeKey(ui, ' ')
    await clock.advance(40 * 3)
    expect(await line(ui)).toBe('') // the first game is over: the hints are gone
    await ui.press({ key: 'play' })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  })

  test('the high score survives the run that set it', async ($, on) => {
    const { clock, ui } = await open($, on)
    await typeKey(ui, ' ')
    await clock.advance(40 * 200)
    // the best is in the picture's scoreboard now, not in the line
    expect(await svg(ui)).toMatch(/>HI 00[1-9]\d</)
    await ui.unmount()
  })

  test('space and the up arrow play from the prompt box, with no click on the game first', async ($, on) => {
    const { clock, ui } = await open($, on)
    expect(await line(ui)).toBe('hints')

    // space starts the run, and the box stays empty: the key is read, not typed
    const kept = await edit($, typed(' ') as never)
    expect(kept.text).toBe('')
    await clock.advance(40 * 5)
    expect(await line(ui)).toBe('hints')

    // the up arrow is a jump now
    await edit($, typed('up') as never)
    await clock.advance(40)
    const during = await svg(ui)
    expect(during).toContain('<svg')

    // never jumping again: the run ends, and space retries it
    await clock.advance(40 * 400)
    expect(await ended(ui)).toBe(true)
    await edit($, typed(' ') as never)
    await clock.advance(40 * 3)
    // the second game: the hints are gone
    expect(await line(ui)).toBe('')
    await ui.unmount()
  })

  test('typing is untouched: a space in a draft, any other key, or a closed game', async ($, on) => {
    const { clock, ui } = await open($, on)
    // a draft already in the box: the space is the person's
    const draft = await edit($, typed(' ', 'fix the') as never)
    expect(draft.text).toBe('fix the ')
    // a letter is typed as ever
    const letter = await edit($, typed('a') as never)
    expect(letter.text).toBe('a')
    await clock.advance(40 * 10)
    expect(await line(ui)).toBe('hints')

    // game closed: space is a space again
    await ui.press({ key: 'play' })
    const after = await edit($, typed(' ') as never)
    expect(after.text).toBe(' ')
    await ui.unmount()
  })

  test('k jumps while a run is live; before that, and in a draft, it is just a letter', async ($, on) => {
    const { clock, ui } = await open($, on)
    // waiting to start: k is typed as ever
    expect((await edit($, typed('k') as never)).text).toBe('k')
    await edit($, typed(' ') as never)
    await clock.advance(40 * 4)
    expect(await line(ui)).toBe('hints')
    // a live run: k is read, not typed
    expect((await edit($, typed('k') as never)).text).toBe('')
    // a draft is never touched
    expect((await edit($, typed('k', 'fix the bu') as never)).text).toBe('fix the buk')
    await ui.unmount()
  })

  test('where the surface cannot hold a key field the line is text, and the jump button is still there', async ($, on) => {
    const { ui } = await open($, on, 'mobile')
    expect(await ui.find({ type: 'Svg' })).toBeDefined()
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    expect(await ui.find({ type: 'Input' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'jump' })).toBeDefined()
    await ui.unmount()
  })

  test('the jump button starts the run and jumps, with or without the focus', async ($, on) => {
    const { clock, ui } = await open($, on)
    await ui.press({ key: 'jump' })
    await clock.advance(40 * 5)
    expect(await line(ui)).toBe('hints')
    await ui.press({ key: 'jump' })
    await clock.advance(40)
    expect(await svg(ui)).toContain('<svg')
    await ui.unmount()
  })

  test('a key mashed as the run ends does not restart it; a press a moment later does', async ($, on) => {
    const { clock, ui } = await open($, on)
    await typeKey(ui, ' ')
    // never jumping: the first bug ends the run
    for (let i = 0; i < 300 && !(await ended(ui)); i++) await clock.advance(40)
    expect(await ended(ui)).toBe(true)

    await typeKey(ui, ' ')
    await clock.advance(40)
    expect(await ended(ui)).toBe(true)

    await clock.advance(600)
    await typeKey(ui, ' ')
    await clock.advance(40 * 3)
    expect(await line(ui)).toBe('') // the first game is over: the hints are gone
    await ui.unmount()
  })

  test('while a run plays the picture is a plan the display moves, not a redraw at every step', async ($, on) => {
    const { clock, ui } = await open($, on)
    await typeKey(ui, ' ')
    await clock.advance(40)
    const plan = await svg(ui)
    // a plan: the next 7.68 s of the run, every moving thing carried as animation
    expect(plan).toContain('dur="7.68s"')
    expect(plan).toContain('<animateTransform')

    // twenty steps on, the picture is the same one (the display has been moving it), and so is the line:
    // the score is counted inside the picture, so nothing in the band has to be redrawn
    const lineBefore = await line(ui)
    await clock.advance(40 * 20)
    expect(await svg(ui)).toBe(plan)
    expect(await line(ui)).toBe(lineBefore)

    // a press changes the plan: the crab is now in the air
    await typeKey(ui, ' ')
    const jumped = await svg(ui)
    expect(jumped).not.toBe(plan)
    // pressing again in mid-air changes nothing, so nothing is redrawn
    await clock.advance(40)
    await typeKey(ui, ' ')
    expect(await svg(ui)).toBe(jumped)
    await ui.unmount()
  })

  test('a run at rest wakes the module only for what the plan says: it ends on time with nothing pressed', async ($, on) => {
    const { clock, ui } = await open($, on)
    await typeKey(ui, ' ')
    const plan = await svg(ui)
    let endedAt = 0
    for (let t = 0; t < 7000 && !endedAt; t += 20) {
      await clock.advance(20)
      if (await ended(ui)) endedAt = t + 20
    }
    // the first bug reaches a standing crab after about 4 seconds, and the end shows within a step of it
    expect(endedAt).toBeGreaterThan(3200)
    expect(endedAt).toBeLessThan(4600)
    // until then the picture was never replaced
    expect(plan).toContain('dur="7.68s"')
    await ui.unmount()
  })

  test('one key that arrives twice (the field and a hotkey) is one press', async ($, on) => {
    const { clock, seen, ui } = await open($, on)
    await typeKey(ui, ' ')
    await clock.advance(40 * 3)
    await typeKey(ui, 'k')
    await ui.press({ key: 'jump' })
    await clock.advance(40)
    expect(seen.traced).toMatch(/press jump=-1->0/)
    expect(seen.traced).toMatch(/press dropped\(repeat\) via=button/)
    await ui.unmount()
  })

  test('a redraw of the band by anything else answers with a plan from now, once', async ($, on) => {
    const { clock, seen, ui } = await open($, on)
    await typeKey(ui, ' ')
    await clock.advance(1000)
    const plan = await svg(ui)
    await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer', usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0, output_tokens: 5 } } as never)
    await clock.advance(10)
    expect(seen.traced).toMatch(/redraw: plan renewed/)
    expect(await svg(ui)).not.toBe(plan)
    await ui.unmount()
  })

  test('every press is on the trace with where it came from', async ($, on) => {
    const { clock, seen, ui } = await open($, on)
    await typeKey(ui, ' ')
    await clock.advance(200)
    await ui.press({ key: 'duck' })
    await clock.advance(200)
    expect(seen.traced).toMatch(/press start via=box move=jump mode=ready/)
    expect(seen.traced).toMatch(/press jump=-1->-1 duck=\d+ queued=false via=button move=duck/)
    await ui.unmount()
  })

  // plays `n` runs to their end, each by never jumping
  const lose = async (clock: { advance: (ms: number) => Promise<unknown> }, ui: Awaited<ReturnType<typeof band>>, n: number) => {
    for (let r = 0; r < n; r++) {
      await typeKey(ui, ' ')
      for (let i = 0; i < 400 && !(await ended(ui)); i++) await clock.advance(40)
      await clock.advance(700)
    }
  }

  test('the first game says its keys in the strip beside the scoreboard, and nothing is drawn under the best score', async ($, on) => {
    const { ui } = await open($, on)
    // click on play: the ready text names K and J
    expect(await svg(ui)).toContain(FIRST_GAME_READY)
    expect(await line(ui)).toBe('hints')
    expect(await svg(ui)).not.toMatch(/class="bn"/)
    expect(await svg(ui)).not.toContain('J duck · K jump')
    // the band holds nothing for them: no row, and the buttons that take the keys are the hidden ones
    expect(await ui.find({ type: 'Box', key: 'hints' })).toBeUndefined()
    expect(await hiddenRow(ui)).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'duck' })).toMatchObject({ props: { hotkey: 'j' } })
    expect(await ui.find({ type: 'Button', key: 'jump' })).toMatchObject({ props: { hotkey: 'k' } })
    await ui.unmount()
  })

  test('the first bug note of the first game names K, and a later game says the usual words', async ($, on) => {
    const { clock, ui } = await open($, on)
    await typeKey(ui, ' ')
    await clock.advance(40)
    expect(await svg(ui)).toContain(FIRST_GAME_NOTES[NOTES.bug])
    expect(await svg(ui)).not.toContain(NOTES.bug)
    await lose(clock, ui, 1)
    // the second game: ready text and notes are the usual ones
    await ui.press({ key: 'jump' })
    await clock.advance(40)
    const second = await svg(ui)
    expect(second).toContain(NOTES.bug)
    expect(second).not.toContain('K jumps it')
    expect(second).not.toContain(FIRST_GAME_READY)
    await ui.unmount()
  })

  test('the picture takes the same room in every game', async ($, on) => {
    const { clock, ui } = await open($, on)
    const sizeOf = async () => {
      const el = (await ui.find({ type: 'Svg' })) as { props?: { width?: number; height?: number } } | undefined

      return `${el?.props?.width}x${el?.props?.height}`
    }
    const first = await sizeOf()
    await lose(clock, ui, 1)
    expect(await line(ui)).toBe('')
    expect(await sizeOf()).toBe(first)
    expect(await ui.find({ type: 'Box', key: 'hints' })).toBeUndefined()
    await ui.unmount()
  })

  test('once the first game is over the key words are gone from the strip but J and K still play', async ($, on) => {
    const { clock, seen, ui } = await open($, on)
    // the buttons drawn for the first game are replaced by fresh ones once it is over, and kept after that
    expect(await ui.find({ type: 'Box', key: 'keys-hidden' })).toBeDefined()
    await lose(clock, ui, 1)
    expect(await ui.find({ type: 'Box', key: 'keys-hidden' })).toBeUndefined()
    expect(await ui.find({ type: 'Box', key: 'keys-hidden-2' })).toBeDefined()
    expect(seen.traced).toMatch(/keys drawn keys-hidden-2 runs=1/)
    expect(await svg(ui)).toContain('GAME OVER')
    expect(await line(ui)).toBe('')
    expect(await ui.find({ type: 'Input' })).toBeUndefined()
    expect(await hiddenRow(ui)).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'jump' })).toMatchObject({ props: { hotkey: 'k' } })
    expect(await ui.find({ type: 'Button', key: 'duck' })).toMatchObject({ props: { hotkey: 'j' } })
    // the second game, played by the buttons only (what the hotkeys raise): K starts it, K jumps, J ducks
    await ui.press({ key: 'jump' })
    await clock.advance(40 * 4)
    expect(seen.traced).toMatch(/press start via=button/)
    expect(await line(ui)).toBe('')
    await ui.press({ key: 'jump' })
    await clock.advance(40 * 30)
    await ui.press({ key: 'duck' })
    expect(await svg(ui)).toContain('1.1 .5')
    // and the prompt box still plays it too
    await clock.advance(40 * 30)
    expect((await edit($, typed('k') as never)).text).toBe('')
    // a third game the same way, after the second ends
    for (let i = 0; i < 400 && !(await ended(ui)); i++) await clock.advance(40)
    await clock.advance(700)
    await ui.press({ key: 'jump' })
    await clock.advance(40 * 4)
    expect(await ended(ui)).toBe(false)
    expect(await hiddenRow(ui)).toBeDefined()
    await ui.unmount()
  })

  test('soak: two minutes of random play never storms, never wedges, and always ends and restarts', async ($, on) => {
    const { clock, seen, ui } = await open($, on)
    let seed = 12345
    const rnd = () => {
      seed = (seed * 16807) % 2147483647

      return seed / 2147483647
    }
    const sources = new Set<string>()
    let presses = 0
    let runs = 0
    let wasOver = false
    for (let t = 0; t < 120000; t += 20) {
      await clock.advance(20)
      const over = await ended(ui)
      if (over && !wasOver) runs++
      wasOver = over
      sources.add(await svg(ui))
      // a player that mashes now and then, from every road a key can take, and mostly gets it wrong
      if (rnd() < 0.04) {
        presses++
        const road = rnd()
        if (road < 0.35) await typeKey(ui, rnd() < 0.2 ? 'j' : rnd() < 0.5 ? 'k' : ' ')
        else if (road < 0.55) await ui.press({ key: rnd() < 0.3 ? 'duck' : 'jump' }).catch(() => undefined)
        else if (road < 0.8) await edit($, typed(rnd() < 0.2 ? 'down' : rnd() < 0.5 ? 'up' : ' ') as never)
        else await edit($, typed('up') as never)
      }
    }
    expect(runs).toBeGreaterThan(3)
    // a picture is made for a press, a renewal or the end of a run, never for the clock alone
    expect(sources.size).toBeLessThan(presses + runs * 3 + 60)
    // (the kit has no site that holds a keyboard, so asking for one fails: that is the only failure there may be)
    expect(seen.traced.split('\n').filter(t => /failed|Error/.test(t) && !/focus mount-\d+ try@\d+ failed/.test(t))).toEqual([])
    await ui.unmount()
  })

  test('the plan starts part-way into a step, so the picture is right at its first moment', async ($, on) => {
    const { clock, ui } = await open($, on)
    await typeKey(ui, ' ')
    await clock.advance(40 * 3 + 17)
    await typeKey(ui, ' ')
    // 17 ms into the step plus the lead the picture is drawn ahead by: not a whole step, not nothing
    const begins = [...(await svg(ui)).matchAll(/begin="(-?[\d.]+)s"/g)].map(m => Number(m[1]))
    expect(begins.some(b => b < 0 && b > -0.04)).toBe(true)
    await ui.unmount()
  })

  test('the classic motion redraws at every step, as 0.10 did', { options: { motion: 'classic' } }, async ($, on) => {
    const { clock, ui } = await open($, on)
    await typeKey(ui, ' ')
    await clock.advance(40)
    const a = await svg(ui)
    expect(a).not.toContain('dur="7.68s"')
    await clock.advance(40)
    expect(await svg(ui)).not.toBe(a)
    await ui.unmount()
  })

  test('j and the down arrow duck, k and space and the up arrow jump', async ($, on) => {
    const { clock, ui } = await open($, on)
    expect(await ui.find({ type: 'Button', key: 'duck' })).toMatchObject({ props: { hotkey: 'j' } })
    await typeKey(ui, ' ')
    await clock.advance(40 * 3)
    expect(await svg(ui)).not.toContain('1.1 .5')

    await edit($, typed('j') as never)
    expect(await svg(ui)).toContain('1.1 .5')
    await clock.advance(40 * 20)
    // the duck is over: a plan with no duck in it
    await edit($, typed('up') as never)
    expect(await svg(ui)).not.toContain('1.1 .5')
    await clock.advance(40 * 20)
    await edit($, typed('down') as never)
    expect(await svg(ui)).toContain('1.1 .5')
    await clock.advance(40 * 30)
    await ui.unmount()
  })

  test('the down arrow and j at an empty prompt box duck a live run, and are typing otherwise', async ($, on) => {
    const { clock, ui } = await open($, on)
    // waiting to start: j is typed as ever
    expect((await edit($, typed('j') as never)).text).toBe('j')
    await edit($, typed(' ') as never)
    await clock.advance(40 * 4)
    expect((await edit($, typed('down') as never)).text).toBe('')
    expect(await svg(ui)).toContain('1.1 .5')
    await clock.advance(40 * 20)
    expect((await edit($, typed('j') as never)).text).toBe('')
    expect((await edit($, typed('j', 'fix the bu') as never)).text).toBe('fix the buj')
    await ui.unmount()
  })

  test('a run that ends is a still, with the crab flipped, and a retry is a new plan', async ($, on) => {
    const { clock, ui } = await open($, on)
    await typeKey(ui, ' ')
    for (let i = 0; i < 300 && !(await ended(ui)); i++) await clock.advance(40)
    const over = await svg(ui)
    expect(over).toContain('180 15 18')
    expect(over).not.toContain('dur="7.68s"')
    await clock.advance(700)
    await typeKey(ui, ' ')
    await clock.advance(40)
    expect(await svg(ui)).toContain('dur="7.68s"')
    await ui.unmount()
  })

  for (const cols of [40, 100, 200]) {
    test(`the picture fills the band's width and keeps the field's shape (${cols} columns)`, async ($, on) => {
      const { ui } = await open($, on, 'desktop', { bodyColumns: cols })
      const el = (await ui.find({ type: 'Svg' })) as { props?: { width?: number; height?: number; source?: string } } | undefined
      const { width = 0, height = 0, source = '' } = el?.props ?? {}
      // as wide as the band is (a column is about 8.4 px), up to a limit
      expect(width).toBe(Math.min(1000, Math.floor(cols * 8.4)))
      const units = Number(/viewBox="0 0 (\d+) 72"/.exec(source)?.[1])
      expect(units).toBeGreaterThanOrEqual(260)
      expect(units).toBeLessThanOrEqual(520)
      expect(Math.abs(width / height - units / 72)).toBeLessThan(0.1)
      await ui.unmount()
    })
  }
})

describe('band layout', () => {
  test('no git row: the repo, its branch and the diff are gone, and git is never asked while drawing', async ($, on) => {
    const seen = world(on as never, '/work/hotelmate', [{ root: '/work/hotelmate', branch: 'feature/x', dirty: 2 }])
    await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as never)

    for (const surface of SURFACES) {
      const ui = await band($, surface, { bodyColumns: 200 })
      const tree = JSON.stringify(await ui.drawn())
      for (const gone of ['hotelmate', 'feature/x', '⎇', 'elsewhere']) expect(tree).not.toContain(gone)
      expect(await ui.find({ type: 'Button', key: 'branch-active' })).toBeUndefined()
      expect(await ui.find({ type: 'Button', text: /Handoff/ })).toBeDefined()
      await ui.unmount()
    }
    expect(seen.toasts).toEqual([])
  })

  test('the play control sits left of Handoff', async ($, on) => {
    world(on as never, '/work/none', [])
    const ui = await band($, 'terminal', { bodyColumns: 120 })
    const tree = JSON.stringify(await ui.drawn())
    expect(tree.indexOf('play')).toBeGreaterThan(-1)
    expect(tree.indexOf('Handoff')).toBeGreaterThan(tree.indexOf('play'))
    await ui.unmount()
  })

  for (const surface of SURFACES) {
    for (const cols of [28, 30, 45, 69, 70, 99, 100, 200]) {
      test(`play and Handoff both stay on screen at ${cols} columns, even while confirming (${surface})`, async ($, on) => {
        world(on as never, '/work/none', [])
        const hasPlay = async (ui: Awaited<ReturnType<typeof band>>) =>
          (await ui.find({ type: 'Button', key: 'play' })) !== undefined
        const ui = await band($, surface, { bodyColumns: cols })
        expect(await ui.find({ type: 'Button', text: /Handoff/ })).toBeDefined()
        // below 30 columns there is no room for the game, so no control for it
        expect(await hasPlay(ui)).toBe(cols >= 30)
        await ui.press({ key: 'handoff' })
        expect(await ui.find({ type: 'Button', text: /Confirm/ })).toBeDefined()
        expect(await hasPlay(ui)).toBe(cols >= 30)
        await ui.unmount()
      })
    }
  }

  test('handoff still names the repo and branch in the note', async ($, on) => {
    let filled = ''
    world(on as never, '/work/hotelmate', [{ root: '/work/hotelmate', branch: 'feature/x', dirty: 2 }])
    on('model.fork', () => ({
      value: {
        isAnswered: true as const,
        text: '**Goal** ship it',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 1, cache_creation_input_tokens: 0 },
      },
    }))
    on('command.run', () => ({ text: '' }))
    on('session.turns', () => ({ value: 0 }))
    on('prompt.fill', (_$, e) => {
      filled = e.text
      return { isFilled: true, text: e.text, cursor: e.text.length }
    })

    const ui = await band($, 'terminal')
    await ui.press({ key: 'handoff' })
    await ui.press({ key: 'handoff' })
    expect(filled).toContain('working in: hotelmate on feature/x, 2 uncommitted - /work/hotelmate')
    await ui.unmount()
  })
})

describe('limits', () => {
  // 2026-10-12 10:00 UTC is a fixed moment; the 5-hour window ends 2h14m later
  const NOW = Date.parse('2026-10-12T10:00:00Z')
  const END = new Date(NOW + (2 * 60 + 14) * 60000)
  const hh = END.getHours() % 12 || 12
  const clock = `${hh}:${String(END.getMinutes()).padStart(2, '0')}${END.getHours() < 12 ? 'am' : 'pm'}`
  const limits = [
    { kind: 'five_hour', percentUsed: 32, resetsAt: END.toISOString() },
    { kind: 'seven_day', percentUsed: 12, resetsAt: new Date(NOW + 3 * 86400000).toISOString() },
  ]

  const open = async ($: Engine, on: (name: string, fn: (...a: never[]) => unknown) => void, bodyColumns: number) => {
    world(on as never, '/work/none', [], false)
    on('clock.now', () => ({ value: NOW }))
    on('session.start', (_$, e) => ({ cwd: (e as { cwd: string }).cwd }))
    on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200000 }, rateLimits: limits } }))
    await $.session.start({ cwd: '/work/none', surface: 'desktop' } as never)
    return band($, 'desktop', { bodyColumns })
  }

  for (const cols of [60, 95, 99, 100, 160]) {
    test(`5h shows the percent and the clock time it resets at ${cols} columns`, async ($, on) => {
      const ui = await open($, on as never, cols)
      const tree = JSON.stringify(await ui.drawn())
      expect(tree).toContain('5h')
      expect(tree).toContain('"32","%"')
      expect(tree).toContain(`↻${clock}`)
      // the countdown and the weekly reset only fit on a wide band
      expect(tree.includes('(2h14m)')).toBe(cols >= 100)
      expect(tree.includes('↻3d0h')).toBe(cols >= 100)
      await ui.unmount()
    })
  }
})
