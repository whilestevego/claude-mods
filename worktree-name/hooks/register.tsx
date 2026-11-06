import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// `git rev-parse --show-toplevel` names the worktree the session is in, unlike $.session.repo(),
// which answers the main working tree. Outside a repo git fails and the name is empty.
const names = new Map<string, Promise<string>>()
const worktreeOf = async ($: EngineInterface) => {
  const cwd = await $.session.cwd()
  if (!names.has(cwd)) {
    names.set(cwd, $.process.run(['git', '-C', cwd, 'rev-parse', '--show-toplevel'])
      .then(r => (r.exitCode === 0 ? r.stdout.trim().split('/').pop() ?? '' : ''))
      .catch(() => ''))
  }
  return names.get(cwd)!
}

const copied = atom({ plugin: 'worktree-name', key: 'copied' } as const, false)

export const register: Register = on => {
  // Draws after whatever the footer's right side already shows (the session-id mod's name and id).
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const rest = await next(e)
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return rest // no Client elsewhere
    const name = await worktreeOf($)
    if (!name) return rest
    const { Box, Text, Client } = $.ui.resolve(e)
    return (
      <Box>
        {rest}
        <Text> </Text>
        <Client key="worktree-name" module="./chip.tsx" props={{ text: name, copied: await read($, copied) }} />
      </Box>
    )
  })

  on('ui.message', async ($, e, next) => {
    if (e.element !== 'worktree-name' || e.data !== 'copy') return next(e)
    const { isCopied } = await $.ui.copy({ text: await worktreeOf($), surface: e.surface })
    if (isCopied) {
      await update($, copied, () => true)
      $.clock.after(1500, () => update($, copied, () => false))
    }
    return next(e)
  })
}
