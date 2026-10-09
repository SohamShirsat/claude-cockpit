import { describe, expect, test } from 'claude-code/testing'

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
const world = (on: (event: string, hook: (...args: never[]) => unknown) => unknown, cwd: string, repos: Fake[]) => {
  const seen = { toasts: [] as string[], opened: [] as string[], closed: [] as string[] }
  const hook = on as (event: string, hook: (...args: any[]) => unknown) => unknown
  hook('clock.now', () => ({ value: 0 }))
  hook('session.cwd', () => ({ value: cwd }))
  hook('env.get', () => ({ value: '/home/x' }))
  hook('fs.write', () => ({ value: undefined }))
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

describe('game', () => {
  for (const surface of SURFACES) {
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

  for (const surface of SURFACES) {
    test(`the runner is the crab, wearing the costume that was asked for (${surface})`, async ($, on) => {
      world(on as never, '/work/none', [])
      const ui = await band($, surface, { isWorking: true, bodyColumns: 100 })
      await ui.press({ key: 'play' })
      const inRunner = (text: RegExp) => ui.find({ type: 'Text', text, in: 'runner-56' } as never)

      // the clock reads 0, so the auto setting starts on the plain crab: clay body in half blocks
      expect(await inRunner(/plain · best/)).toBeDefined()
      expect(await inRunner(/[▀▄█]/)).toMatchObject({ props: { color: '#D97757' } })
      expect(await inRunner(/[✻✕]/)).toBeDefined()
      await ui.press({ key: 'play' })
      await ui.unmount()
    })
  }

  test('a costume picked in the settings is the one that runs, and it stays through retries', { options: { costume: 'chef' } }, async ($, on) => {
    world(on as never, '/work/none', [])
    const ui = await band($, 'terminal', { isWorking: true, bodyColumns: 100 })
    await ui.press({ key: 'play' })
    const inRunner = (text: RegExp) => ui.find({ type: 'Text', text, in: 'runner-56' } as never)
    expect(await inRunner(/chef · best/)).toBeDefined()

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
    // obstacle spawns at tick 12 at column 55 and reaches the crab's body (col 5) 50 ticks later;
    // the jump has the crab two pixels up from its second tick to its eighth
    await ui.advance(100 * 56)
    await ui.key({ key: 'up', in: 'runner-56' } as never)
    await ui.advance(100 * 12)
    expect(await runner(/game over/)).toBeUndefined()
    expect(await runner(/score/)).toBeDefined()
    await ui.press({ key: 'play' })
    await ui.unmount()
  })
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
