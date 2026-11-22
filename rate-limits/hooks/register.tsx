import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Window } from '../types'
import { color, label, meter, resets } from './gauge'

const windows = atom({ plugin: 'rate-limits', key: 'windows' } as const, [])

async function store($: EngineInterface, next: readonly Window[]) {
  await update($, windows, () => next.map(w => ({ ...w })))
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
