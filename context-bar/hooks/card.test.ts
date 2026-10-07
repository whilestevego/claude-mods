import { test, expect } from 'claude-code/testing'

test('the bar row swaps to the legend while the pointer is over it', async ($, on) => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      rateLimits: [],
      context: {
        window: 200000,
        breakdown: {
          totalTokens: 40000, rawMaxTokens: 200000, percentage: 20,
          categories: [
            { name: 'System prompt', tokens: 10000, color: 'promptBorder', kind: 'used', isDeferred: false },
            { name: 'Messages', tokens: 30000, color: 'claude', kind: 'used', isDeferred: false },
            { name: 'Free space', tokens: 160000, color: 'inactive', kind: 'free', isDeferred: false },
          ],
        },
      },
    } as never,
  }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }) as never)
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', children: [] }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'context-bar', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } as never,
  })
  const shows = (name: RegExp) => ui.find({ type: 'Text', text: name, in: 'context-bar' })
  expect(await shows(/20% 40.0k\/200.0k/)).toBeDefined()
  expect(await shows(/Messages/)).toBeUndefined()
  await ui.pointer({ type: 'enter', x: 3, y: 0 })
  expect(await shows(/Messages/)).toBeDefined()
  expect(await shows(/20% 40.0k\/200.0k/)).toBeUndefined()
  await ui.pointer({ type: 'leave', x: 3, y: 0 })
  expect(await shows(/Messages/)).toBeUndefined()
  expect(await shows(/20% 40.0k\/200.0k/)).toBeDefined()
  await ui.unmount()
})
