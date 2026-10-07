import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Window } from '../types'
import { color, label, meter, resets, toWarn } from './gauge'

const windows = atom({ plugin: 'rate-limits', key: 'windows' } as const, [])
const warned = atom({ plugin: 'rate-limits', key: 'warned' } as const, [])

async function store($: EngineInterface, next: readonly Window[]) {
  await update($, windows, () => next.map(w => ({ ...w })))
  const fresh = toWarn(next, await read($, warned))
  if (fresh.length === 0) return
  await update($, warned, all => [...all, ...fresh].slice(-20))
  for (const w of next.filter(w => fresh.includes(`${w.kind}@${w.resetsAt ?? ''}`)))
    $.ui.toast(`⚠️ ${label(w.kind)} rate limit at ${w.percentUsed}%${w.resetsAt ? `, resets ${resets(w.resetsAt, Date.now())}` : ''}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await store($, (await $.session.usage()).rateLimits)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length) await store($, e.rateLimits)
    return next(e)
  })

  // Stacks under what the plugins beneath draw (the context bar); nothing off a subscription.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const list = await read($, windows)
    if (e.props.hasSurvey || list.length === 0) return below

    const { Box, Text } = $.ui.resolve(e)
    const now = Date.now()
    return (
      <Box flexDirection="column">
        {below}
        <Text wrap="truncate">
          {list.map((w, i) => (
            <Text>
              {i > 0 && <Text dimColor>   </Text>}
              <Text dimColor>{label(w.kind)} </Text>
              <Text color={color(w.percentUsed)}>{meter(w.percentUsed)}</Text>
              <Text dimColor> {w.percentUsed}%{w.resetsAt ? ` ↻ ${resets(w.resetsAt, now)}` : ''}</Text>
            </Text>
          ))}
        </Text>
      </Box>
    )
  })
}
