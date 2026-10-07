import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

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

export const register: Register = (on, options) => {
  const rows = typeof options.rows === 'number' && options.rows > 0 ? Math.min(60, options.rows) : 14

  on('session.start', async ($, e, next) => {
    home = (await $.process.run(['sh', '-c', 'echo "$HOME"'])).stdout.trim()
    return next(e)
  })

  // An image Read's row, plus the 🖼 line; the picture itself only while the pointer is on that line.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const path = imagePath(e.props.tool, e.props.input)
    if (!path || e.surface !== 'terminal') return next(e)
    const row = await next(e)
    const { Box, Client, Image } = $.ui.resolve(e)
    const isShown = (await read($, shown)) === e.requestId
    const name = path.split('/').pop() ?? path
    const pic = isShown ? await prepared$($, path) : null
    const box = pic && boxFor(pic.width, pic.height, rows, Math.max(10, (e.viewport?.columns ?? 80) - 6))
    return (
      <Box flexDirection="column">
        {row}
        <Client key={`preview-${e.requestId}`} module="./preview.tsx" props={{ name, shown: isShown }} />
        {pic && box && (
          <Box marginLeft={4}>
            <Image source={{ file: pic.png, format: 'png' }} rows={box.rows} columns={box.columns} alt={name} />
          </Box>
        )}
      </Box>
    )
  })

  on('ui.message', async ($, e, next) => {
    if (!e.element.startsWith('preview-')) return next(e)
    const id = e.element.slice('preview-'.length)
    await update($, shown, current => (e.data === 'enter' ? id : current === id ? null : current))
    return next(e)
  })
}
