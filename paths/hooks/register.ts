import type { EngineInterface, Register } from 'claude-code'

import { absolute, findRefs, hrefFor, linkify } from './links'

let openWith = 'file'
let home = ''
/** path (absolute) → whether it exists; replies redraw often, the disk isn't asked twice. */
const seen = new Map<string, boolean>()

async function exists($: EngineInterface, abs: string): Promise<boolean> {
  const known = seen.get(abs)
  if (known !== undefined) return known
  const found = await $.fs.stat(abs).then(() => true, () => false)
  if (seen.size > 2000) seen.clear()
  seen.set(abs, found)
  return found
}

/** Each referenced path that exists on disk → its absolute path. */
async function resolve($: EngineInterface, paths: readonly string[]): Promise<Map<string, string>> {
  const cwd = await $.session.cwd()
  const pairs = await Promise.all(
    paths.map(async p => {
      const abs = absolute(p, cwd, home)
      return (await exists($, abs)) ? ([p, abs] as const) : null
    }),
  )
  return new Map(pairs.filter(x => x !== null))
}

export const register: Register = (on, options) => {
  openWith = typeof options.openWith === 'string' ? options.openWith : 'file'

  on('session.start', async ($, e, next) => {
    home = (await $.process.run(['sh', '-c', 'echo "$HOME"'])).stdout.trim()
    return next(e)
  })

  // Claude's replies only: the rewrite changes what's drawn, never what the model read.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const paths = findRefs(e.props.text)
    if (paths.length === 0) return next(e)
    const resolved = await resolve($, paths)
    if (resolved.size === 0) return next(e)
    const text = linkify(e.props.text, resolved, (abs, ref) => hrefFor(openWith, abs, ref))
    return next({ ...e, props: { ...e.props, text } })
  })
}
