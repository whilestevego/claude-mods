import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderNode } from 'claude-code'

import { boxFor, cacheName, imagePath, needsConversion, parseSize } from './image'

const shown = atom({ plugin: 'previews', key: 'shown' } as const, null)

let home = ''
/** image path → what to draw (a PNG path and its size), worked out once. */
const prepared = new Map<string, Promise<{ png: string; width: number; height: number } | null>>()

async function prepare($: EngineInterface, path: string) {
  const stat = await $.fs.stat(path).catch(() => null)
  if (!stat) return null
  let png = path
  if (needsConversion(path)) {
    const dir = `${home}/Library/Caches/claude-previews`
    png = `${dir}/${cacheName(path, (stat as { mtimeMs?: number }).mtimeMs ?? 0)}`
    await $.process.run(['mkdir', '-p', dir])
    const r = await $.process.run(['sips', '-s', 'format', 'png', path, '--out', png])
    if (r.exitCode !== 0) return null
  }
  const size = parseSize((await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', png])).stdout)
  return { png, ...size }
}

function prepared$($: EngineInterface, path: string) {
  if (!prepared.has(path)) prepared.set(path, prepare($, path).catch(() => null))
  return prepared.get(path)!
}

/** How tall a preview is drawn, from the setting. */
let previewRows = 14

/** A row plus a 🖼 line per image it read; a picture only while the pointer is on its line. */
async function withPreviews($: EngineInterface, ui: Elements['terminal'], requestId: string, columns: number, row: RenderNode, paths: string[]) {
  const { Box, Client, Image } = ui
  const current = await read($, shown)
  const maxColumns = Math.max(10, columns - 6)
  const lines = await Promise.all(
    paths.map(async (path, i) => {
      const id = `${requestId}~${i}`
      const name = path.split('/').pop() ?? path
      const isShown = current === id
      const pic = isShown ? await prepared$($, path) : null
      const box = pic && boxFor(pic.width, pic.height, previewRows, maxColumns)
      return (
        <Box flexDirection="column">
          <Client key={`preview-${id}`} module="./preview.tsx" props={{ name, shown: isShown }} />
          {pic && box && (
            <Box marginLeft={4}>
              <Image source={{ file: pic.png, format: 'png' }} rows={box.rows} columns={box.columns} alt={name} />
            </Box>
          )}
        </Box>
      )
    }),
  )
  return (
    <Box flexDirection="column">
      {row}
      {lines}
    </Box>
  )
}

export const register: Register = (on, options) => {
  previewRows = typeof options.rows === 'number' && options.rows > 0 ? Math.min(60, options.rows) : 14

  on('session.start', async ($, e, next) => {
    home = (await $.process.run(['sh', '-c', 'echo "$HOME"'])).stdout.trim()
    return next(e)
  })

  // A single tool row (expanded transcripts, --verbose).
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const path = imagePath(e.props.tool, e.props.input)
    if (!path || e.surface !== 'terminal') return next(e)
    return withPreviews($, $.ui.resolve(e), e.requestId, e.viewport?.columns ?? 80, await next(e), [path])
  })

  // The collapsed row ("Read 3 files") that groups tool calls by default.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded) return next(e)
    const paths = e.props.calls.map(c => imagePath(c.tool, c.input)).filter((p): p is string => p !== undefined)
    if (paths.length === 0) return next(e)
    return withPreviews($, $.ui.resolve(e), e.requestId, e.viewport?.columns ?? 80, await next(e), paths)
  })

  on('ui.message', async ($, e, next) => {
    if (!e.element.startsWith('preview-')) return next(e)
    const id = e.element.slice('preview-'.length)
    await update($, shown, current => (e.data === 'enter' ? id : current === id ? null : current))
    return next(e)
  })
}
