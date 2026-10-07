import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Receipt } from '../types'
import { fullLine } from './receipt'

const byDuration = atom({ plugin: 'turn-receipt', key: 'byDuration' } as const, {})

async function spent($: EngineInterface) {
  return (await $.session.usage()).cost?.usd ?? null
}

export const register: Register = on => {
  // The turn in progress; a reload mid-turn just under-counts that one turn.
  let tools = 0
  let files = new Set<string>()
  let usdAtStart: number | null = null

  on('prompt.submit', async ($, e, next) => {
    tools = 0
    files = new Set()
    usdAtStart = await spent($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    tools += 1
    const ran = await next(e)
    if (!ran.isError && (e.tool === 'Edit' || e.tool === 'Write')) files.add(e.file_path)
    if (!ran.isError && e.tool === 'NotebookEdit') files.add(e.notebook_path)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    const usd = await spent($)
    const receipt: Receipt = {
      ms: e.durationMs,
      tools,
      files: [...files],
      usd: usd !== null && usdAtStart !== null ? usd - usdAtStart : null,
      isAborted: e.isAborted,
      doneAt: Date.now(),
      tokensIn: e.usage ? e.usage.input_tokens + e.usage.cache_read_input_tokens + e.usage.cache_creation_input_tokens : null,
      tokensOut: e.usage?.output_tokens ?? null,
    }
    // ponytail: two turns with the same durationMs share a receipt; key by a real turn id if the line ever carries one.
    await update($, byDuration, all => Object.fromEntries([...Object.entries(all), [String(e.durationMs), receipt]].slice(-500)))
    return next(e)
  })

  // Redraws the engine's end-of-turn line ("✻ Baked for 42s · done 10:21 PM") with the receipt on the end.
  // The engine's own line is an opaque handle a mod can't add to, so this draws the whole line.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const receipt = (await read($, byDuration))[String(e.props.durationMs)]
    if (!receipt?.doneAt) return next(e) // receipts saved before doneAt existed keep the plain line
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{fullLine(e.props.word, receipt)}</Text>
  })
}
