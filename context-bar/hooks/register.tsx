import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Segment, Snapshot } from '../types'
import { cells, kTokens, shortName } from './bar'
import type { BarView } from './barview'

const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null)
const isOn = atom({ plugin: 'context-bar', key: 'isOn' } as const, true)

const GLYPH = { used: '█', buffer: '▒', free: '░' } as const

async function refresh($: EngineInterface) {
  const breakdown = (await $.session.usage({ breakdown: 'summary' })).context.breakdown
  if (!breakdown) return
  const segments: Segment[] = breakdown.categories
    .filter(c => c.kind !== 'deferred' && c.tokens > 0)
    .map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind as Segment['kind'] }))
  const next: Snapshot = {
    segments,
    used: breakdown.totalTokens,
    max: breakdown.rawMaxTokens,
    percent: breakdown.percentage,
  }
  await update($, snapshot, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'context-bar', description: 'Toggle the context window bar above the prompt' })
    void refresh($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (await read($, isOn)) await refresh($)
    return next(e)
  })

  on('command.run', { command: 'context-bar' }, async $ => {
    const now = !(await read($, isOn))
    await update($, isOn, () => now)
    if (now) await refresh($)
    return { text: `Context bar ${now ? 'on' : 'off'}.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Draw on top of what the plugins beneath draw (the turn receipt) instead of replacing it.
    const below = await next(e)
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || !snap || !(await read($, isOn))) return below
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return below // no Client elsewhere

    const { Box, Client } = $.ui.resolve(e)
    const label = ` ${snap.percent}% ${kTokens(snap.used)}/${kTokens(snap.max)}`
    const counts = cells(snap.segments, Math.max(10, e.props.bodyColumns - label.length))
    const view: BarView = {
      runs: snap.segments.map((s, i) => ({ text: GLYPH[s.kind].repeat(counts[i] ?? 0), color: s.color })),
      label,
      legend: snap.segments.filter(s => s.kind === 'used').map(s => ({ color: s.color, name: shortName(s.name), tokens: kTokens(s.tokens) })),
    }

    return (
      <Box flexDirection="column">
        <Client key="context-bar" module="./barview.tsx" props={view} width="100%" />
        {below}
      </Box>
    )
  })
}
