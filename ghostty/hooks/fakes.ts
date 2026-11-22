import type { On } from 'claude-code'
import type {} from '../../session-info/types'

/**
 * For tests: a stand-in for the session-info mod's $.sessionInfo, with Claude on /dev/ttys004 as pid 4242.
 * `title` is what a new title comes out as; `titles` holds the saved ones by conversation.
 */
export function fakeSessionInfo(on: On, opts: { sessionId: string; title: string; titles?: Record<string, string> }) {
  const titles = opts.titles ?? {}
  const waiting = new Map<string, (isUp: boolean) => void>()
  on('engine.create', async (_$, e, next) => ({
    ...(await next(e)),
    sessionInfo: {
      process: async () => ({ pid: '', tty: '' }),
      newTitle: async () => '',
      savedTitle: async () => '',
      saveTitle: async () => {},
      dialogFor: async () => false,
    },
  }))
  on('sessionInfo.process', () => ({ value: { pid: '4242', tty: '/dev/ttys004' } }))
  on('sessionInfo.newTitle', () => ((titles[opts.sessionId] = opts.title), { value: opts.title }))
  on('sessionInfo.savedTitle', (_$, e) => ({ value: titles[e.sessionId ?? opts.sessionId] ?? '' }))
  on('sessionInfo.saveTitle', (_$, e) => ((titles[e.sessionId] = e.title), { value: undefined }))
  on('sessionInfo.dialogFor', (_$, e) => new Promise(answer => waiting.set(e.id, isUp => answer({ value: isUp }))))
  return {
    titles,
    /** Claude Code's permission dialog comes up for each call that waits on one. */
    openDialog() {
      for (const [id, answer] of waiting) (waiting.delete(id), answer(true))
    },
    /** Call `id` ran or was refused: its watch ends with no dialog. */
    finish(id = '') {
      waiting.get(id)?.(false)
      waiting.delete(id)
    },
  }
}
