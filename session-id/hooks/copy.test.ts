import { test, expect, mock } from 'claude-code/testing'

test('click copies the id, shows Copied, then reverts', async ($, on) => {
  const clock = mock.clock(on)
  let clip = ''
  const shapes: string[] = []
  on('process.run', (_$, e) => (shapes.push(e.argv.at(-1)!), { value: { exitCode: 0, stdout: '', stderr: '' } } as never))
  on('session.id', () => ({ value: 'abc-123' }))
  on('ui.copy', (_$, e) => ((clip = e.text), { value: { isCopied: true } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    clip = ''
    const ui = await $.ui.mount({ plugin: 'session-id', surface, component: 'SessionMode', props: { modes: [] } })
    const shows = (text: RegExp) => ui.find({ type: 'Text', text, in: 'session-id' })
    expect((await shows(/^abc-123$/))?.props.color).toBeUndefined()
    await ui.pointer({ type: 'enter', x: 3, y: 0 })
    expect((await shows(/^abc-123$/))?.props.color).toBe('blue')
    await ui.pointer({ type: 'leave', x: 3, y: 0 })
    expect(shapes.splice(0)).toEqual(['pointer', 'default'])
    await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left' })
    await ui.pointer({ type: 'up', x: 3, y: 0, button: 'left' })
    expect(clip).toBe('abc-123')
    expect(await shows(/✓ Copied/)).toBeDefined()
    await clock.advance(1500)
    expect(await shows(/abc-123/)).toBeDefined()
    await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', ctrl: true })
    await ui.pointer({ type: 'up', x: 3, y: 0, button: 'left', ctrl: true })
    expect(clip).toBe('claude --resume abc-123')
    expect(await shows(/✓ Copied/)).toBeDefined()
    await clock.advance(1500)
    await ui.unmount()
  }
})
