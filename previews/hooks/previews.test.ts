import { test, expect } from 'claude-code/testing'

test('an image Read shows its picture only while the pointer is on the 🖼 line', async ($, on) => {
  on('process.run', (_$, e) => {
    const argv = e.argv as string[]
    const stdout = argv[0] === 'sips' ? '/x\n  pixelWidth: 800\n  pixelHeight: 400\n' : '/home/me\n'
    return { value: { exitCode: 0, stdout, stderr: '' } } as never
  })
  on('fs.stat', () => ({ value: { mtimeMs: 1 } }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'Text', children: ['Read(/tmp/shot.png)'] }) as never)
  on('ui.message', () => ({}) as never)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'previews', surface: 'terminal', component: 'ToolUse', requestId: 'toolu_1',
    props: { tool: 'Read', input: { file_path: '/tmp/shot.png' }, isRunning: false, isErrored: false, isInterrupted: false } as never,
  })
  const picture = () => ui.find({ type: 'Image' })
  expect(await ui.find({ type: 'Text', text: /hover to preview/, in: 'preview-toolu_1' })).toBeDefined()
  expect(await picture()).toBeUndefined()
  await ui.pointer({ type: 'enter', x: 3, y: 0, in: 'preview-toolu_1' })
  const shown = await picture()
  expect(shown).toBeDefined()
  expect(JSON.stringify(shown)).toContain('/tmp/shot.png')
  await ui.pointer({ type: 'leave', x: 3, y: 0, in: 'preview-toolu_1' })
  expect(await picture()).toBeUndefined()
})

test('other tool rows are left alone', async ($, on) => {
  let calls = 0
  on('ui.render', () => (calls++, { type: 'Text', children: ['Read(notes.md)'] }) as never)
  const ui = await $.ui.mount({
    plugin: 'previews', surface: 'terminal', component: 'ToolUse', requestId: 'toolu_2',
    props: { tool: 'Read', input: { file_path: '/tmp/notes.md' }, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(calls).toBe(1)
})
