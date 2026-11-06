import { test, expect, mock } from 'claude-code/testing'

test('shows the worktree name and copies it on click', async ($, on) => {
  const clock = mock.clock(on)
  let clip = ''
  on('session.cwd', () => ({ value: '/src/app-feature' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/src/app-feature\n', stderr: '' } }) as never)
  on('ui.render', { component: 'SessionMode' }, ($, e) => { const { Text } = $.ui.resolve(e); return <Text>footer</Text> })
  on('ui.copy', (_$, e) => ((clip = e.text), { value: { isCopied: true } }))
  const ui = await $.ui.mount({ plugin: 'worktree-name', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
  expect(await ui.find({ type: 'Text', text: /^app-feature$/, in: 'worktree-name' })).toBeDefined()
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'worktree-name' })
  await ui.pointer({ type: 'up', x: 3, y: 0, button: 'left', in: 'worktree-name' })
  expect(clip).toBe('app-feature')
  expect(await ui.find({ type: 'Text', text: /✓ Copied/, in: 'worktree-name' })).toBeDefined()
  await clock.advance(1500)
  expect(await ui.find({ type: 'Text', text: /^app-feature$/, in: 'worktree-name' })).toBeDefined()
  await ui.unmount()
})
