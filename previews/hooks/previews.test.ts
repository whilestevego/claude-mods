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
  expect(await ui.find({ type: 'Text', text: /hover to preview/, in: 'preview-toolu_1~0' })).toBeDefined()
  expect(await picture()).toBeUndefined()
  await ui.pointer({ type: 'enter', x: 3, y: 0, in: 'preview-toolu_1~0' })
  const shown = await picture()
  expect(shown).toBeDefined()
  expect(JSON.stringify(shown)).toContain('/tmp/shot.png')
  await ui.pointer({ type: 'leave', x: 3, y: 0, in: 'preview-toolu_1~0' })
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

test('a collapsed row ("Read 2 files") gets a 🖼 line for each image in it', async ($, on) => {
  on('process.run', (_$, e) => {
    const argv = e.argv as string[]
    const stdout = argv[0] === 'sips' ? '/x\n  pixelWidth: 800\n  pixelHeight: 400\n' : '/home/me\n'
    return { value: { exitCode: 0, stdout, stderr: '' } } as never
  })
  on('fs.stat', () => ({ value: { mtimeMs: 1 } }) as never)
  on('ui.render', () => ({ type: 'Text', children: ['Read 3 files'] }) as never)
  on('ui.message', () => ({}) as never)
  const call = (file_path: string) => ({ tool: 'Read', input: { file_path }, isRunning: false, isErrored: false, isInterrupted: false })
  const ui = await $.ui.mount({
    plugin: 'previews', surface: 'terminal', component: 'ToolGroup', requestId: 'grp_1',
    props: { calls: [call('/tmp/a.png'), call('/tmp/notes.md'), call('/tmp/b.jpg')], isActive: false, isExpanded: false } as never,
  })
  expect(await ui.find({ type: 'Text', text: /a\.png · hover to preview/, in: 'preview-grp_1~0' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /b\.jpg · hover to preview/, in: 'preview-grp_1~1' })).toBeDefined()
  await ui.pointer({ type: 'enter', x: 3, y: 0, in: 'preview-grp_1~1' })
  expect(JSON.stringify(await ui.find({ type: 'Image' }))).toContain('.png')  // b.jpg, converted
})
