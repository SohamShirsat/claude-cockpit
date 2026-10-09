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
  inputText: key === 'up' ? '' : key,
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
  const open = async ($: Engine, on: unknown, surface: 'desktop' | 'vscode' | 'mobile' = 'desktop', props: Record<string, unknown> = {}) => {
    const clock = mock.clock(on as never)
    mock.store(on as never)
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

  // the guidance line is a native text field: its placeholder is the line, a typed key is a press
  const line = async (ui: Awaited<ReturnType<typeof band>>) =>
    String(((await ui.find({ type: 'Input', key: 'keys' })) as { props?: { placeholder?: string } } | undefined)?.props?.placeholder ?? '')
  const enter = (ui: Awaited<ReturnType<typeof band>>) =>
    (ui as unknown as { input: (a: unknown) => Promise<unknown> }).input({ key: 'keys', text: '', kind: 'submit' })
  const typeKey = (ui: Awaited<ReturnType<typeof band>>, text: string) =>
    (ui as unknown as { input: (a: unknown) => Promise<unknown> }).input({ key: 'keys', text, kind: 'change' })

  test('play opens one line of guidance and a picture of the crab, and nothing under it', async ($, on) => {
    const { ui } = await open($, on)
    const source = await svg(ui)
    expect(source).toContain('<svg')
    expect(source).toContain('#D97757')
    expect(await line(ui)).toMatch(/plain · grab.*any key to start/)
    expect(await ui.find({ type: 'Input', key: 'keys' })).toMatchObject({ props: { autoFocus: true } })
    // the guidance is said once, in the field; the jump button beside it is a control, not a second line
    expect(await ui.find({ type: 'Button', key: 'jump' })).toMatchObject({ props: { hotkey: 'k' } })
    expect(await ui.find({ type: 'Text', text: /any key/ })).toBeUndefined()
    await ui.press({ key: 'play' })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  })

  test('a key typed in the field starts the run, the picture moves, and it ends on the first bug', async ($, on) => {
    const { clock, ui } = await open($, on)
    const before = await svg(ui)
    await typeKey(ui, ' ')
    await clock.advance(40 * 12)
    expect(await line(ui)).toMatch(/score 00\d\d/)
    expect(await svg(ui)).not.toBe(before)

    // never jumping: a bug reaches the crab
    await clock.advance(40 * 200)
    expect(await line(ui)).toMatch(/game over/)
    // belly up and grey: the crab is drawn rotated
    expect(await svg(ui)).toContain('rotate(180')

    // a press retries; q closes it all
    await typeKey(ui, ' ')
    await clock.advance(40 * 3)
    expect(await line(ui)).toMatch(/score 00/)
    await typeKey(ui, 'q')
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  })

  test('the high score survives the run that set it', async ($, on) => {
    const { clock, ui } = await open($, on)
    await typeKey(ui, ' ')
    await clock.advance(40 * 200)
    expect(await line(ui)).toMatch(/best 00[1-9]\d/)
    await ui.unmount()
  })

  test('space and the up arrow play from the prompt box, with no click on the game first', async ($, on) => {
    const { clock, ui } = await open($, on)
    expect(await line(ui)).toMatch(/to start/)

    // space starts the run, and the box stays empty: the key is read, not typed
    const kept = await edit($, typed(' ') as never)
    expect(kept.text).toBe('')
    await clock.advance(40 * 5)
    expect(await line(ui)).toMatch(/score 00/)

    // the up arrow is a jump now
    await edit($, typed('up') as never)
    await clock.advance(40)
    const during = await svg(ui)
    expect(during).toContain('<svg')

    // never jumping again: the run ends, and space retries it
    await clock.advance(40 * 400)
    expect(await line(ui)).toMatch(/game over/)
    await edit($, typed(' ') as never)
    await clock.advance(40 * 3)
    expect(await line(ui)).toMatch(/score 00/)
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
    expect(await line(ui)).toMatch(/to start/)

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
    expect(await line(ui)).toMatch(/score 00/)
    // a live run: k is read, not typed
    expect((await edit($, typed('k') as never)).text).toBe('')
    // a draft is never touched
    expect((await edit($, typed('k', 'fix the bu') as never)).text).toBe('fix the buk')
    await ui.unmount()
  })

  test('any key typed in the guidance field is a jump', async ($, on) => {
    const { clock, ui } = await open($, on)
    await typeKey(ui, 'x')
    await clock.advance(40 * 4)
    expect(await line(ui)).toMatch(/score 00/)
    await typeKey(ui, 'a')
    await ui.unmount()
  })

  test('play asks the engine to put the focus ring on the guidance field', async ($, on) => {
    const { clock, seen } = await open($, on)
    await clock.advance(100)
    // the kit has no site that holds a keyboard, so the engine refuses; the trace names the attempt
    expect(seen.traced).toMatch(/focus mount-\d+/)
  })

  test('Enter in the field is a jump too', async ($, on) => {
    const { clock, ui } = await open($, on)
    await enter(ui)
    await clock.advance(40 * 4)
    expect(await line(ui)).toMatch(/score 00/)
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
    expect(await line(ui)).toMatch(/score 00/)
    await ui.press({ key: 'jump' })
    await clock.advance(40)
    expect(await svg(ui)).toContain('<svg')
    await ui.unmount()
  })

  test('a key mashed as the run ends does not restart it; a press a moment later does', async ($, on) => {
    const { clock, ui } = await open($, on)
    await typeKey(ui, ' ')
    // never jumping: the first bug ends the run
    for (let i = 0; i < 300 && !/game over/.test(await line(ui)); i++) await clock.advance(40)
    expect(await line(ui)).toMatch(/game over/)

    await typeKey(ui, ' ')
    await clock.advance(40)
    expect(await line(ui)).toMatch(/game over/)

    await clock.advance(600)
    await typeKey(ui, ' ')
    await clock.advance(40 * 3)
    expect(await line(ui)).toMatch(/score 00/)
    await ui.unmount()
  })

  test('when the engine refuses the keyboard the line says to click it, and a key that comes through proves it works', async ($, on) => {
    const { clock, seen, ui } = await open($, on)
    expect(await line(ui)).toMatch(/any key to start/)
    // the kit has no site that holds a keyboard: every ask is refused, and the asking is repeated
    await clock.advance(3000)
    expect(seen.traced.match(/focus mount-\d+ try@/g)?.length).toBeGreaterThanOrEqual(3)
    expect(await line(ui)).toMatch(/click here, then any key to start/)

    await typeKey(ui, ' ')
    await clock.advance(40 * 3)
    expect(await line(ui)).toMatch(/any key to jump/)
    expect(await line(ui)).not.toMatch(/click here/)
    await ui.unmount()
  })

  test('the keys go to the trace and the trace is kept, not wiped, by the next write', async ($, on) => {
    const { clock, seen, ui } = await open($, on)
    await typeKey(ui, 'x')
    await clock.advance(40)
    expect(seen.traced).toMatch(/key via=input "x"/)
    expect(seen.traced).toMatch(/focus mount-\d+/)
    await ui.unmount()
  })

  test('the game outlives the turn: the line says how to get the keyboard back', async ($, on) => {
    const { clock, seen, ui } = await open($, on)
    await typeKey(ui, ' ')
    await clock.advance(40 * 3)
    await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    expect(await line(ui)).toMatch(/any key · esc to type to jump/)
    expect(seen.toasts.some(t => /Esc/.test(t))).toBe(true)
    await ui.unmount()
  })

  for (const cols of [40, 100, 200]) {
    test(`the picture follows the band width and keeps its shape (${cols} columns)`, async ($, on) => {
      const { ui } = await open($, on, 'desktop', { bodyColumns: cols })
      const el = (await ui.find({ type: 'Svg' })) as { props?: { width?: number; height?: number } } | undefined
      const { width = 0, height = 0 } = el?.props ?? {}
      expect(width).toBeLessThanOrEqual(540)
      expect(width).toBeGreaterThanOrEqual(150)
      expect(Math.abs(width / height - 5)).toBeLessThan(0.05)
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
