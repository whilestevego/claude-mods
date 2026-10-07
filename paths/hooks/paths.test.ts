import { test, expect } from 'claude-code/testing'

test('a reply drawing links the files that exist', { options: { openWith: 'zed' } }, async ($, on) => {
  let drawn = ''
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/home/me\n', stderr: '' } }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo' }) as never)
  on('fs.stat', (_$, e) => {
    const path = (e as unknown as { path: string }).path
    return (path === '/repo/src/app.ts' ? { value: { isFile: true } } : { deny: 'missing' }) as never
  })
  on('ui.render', { component: 'AssistantMessage' }, (_$, e) => ((drawn = e.props.text), { type: 'Box', children: [] }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.ui.mount({
    plugin: 'paths', surface: 'terminal', component: 'AssistantMessage',
    props: { text: 'Fixed `src/app.ts:42`; gone.ts is not real.', isFirstOfReply: true },
  } as never)
  expect(drawn).toBe('Fixed [`src/app.ts:42`](zed://file/repo/src/app.ts:42); gone.ts is not real.')
})
