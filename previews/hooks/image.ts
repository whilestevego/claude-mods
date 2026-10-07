/** Formats the terminal draws as-is, and the ones macOS's `sips` converts to PNG first. */
const PNG = /\.png$/i
const CONVERTIBLE = /\.(jpe?g|gif|webp|heic|heif|tiff?|bmp)$/i

export function isImage(path: string): boolean {
  return PNG.test(path) || CONVERTIBLE.test(path)
}

export function needsConversion(path: string): boolean {
  return !PNG.test(path) && CONVERTIBLE.test(path)
}

/** The image path a Read call opened, when it's an image. */
export function imagePath(tool: string, input: unknown): string | undefined {
  if (tool !== 'Read' || !input || typeof input !== 'object') return undefined
  const path = (input as { file_path?: unknown }).file_path
  return typeof path === 'string' && path.startsWith('/') && isImage(path) ? path : undefined
}

/**
 * A box that keeps the picture's shape (a cell is about twice as tall as wide): `rows` tall when it fits,
 * shorter when the screen's width caps it.
 */
export function boxFor(width: number, height: number, rows: number, maxColumns: number): { rows: number; columns: number } {
  if (!(width > 0 && height > 0)) return { rows, columns: Math.min(rows * 2, maxColumns) }
  const ratio = width / height
  const columns = Math.max(4, Math.min(maxColumns, Math.round(rows * 2 * ratio)))
  return { rows: Math.max(1, Math.min(rows, Math.round(columns / (2 * ratio)))), columns }
}

/** `sips -g pixelWidth -g pixelHeight` output → size. */
export function parseSize(sips: string): { width: number; height: number } {
  const n = (key: string) => Number(new RegExp(`${key}:\\s*(\\d+)`).exec(sips)?.[1] ?? 0)
  return { width: n('pixelWidth'), height: n('pixelHeight') }
}

/** A stable file name for a converted copy (FNV-1a of the path and its modification time). */
export function cacheName(path: string, mtimeMs: number): string {
  let h = 0x811c9dc5
  for (const c of `${path}|${mtimeMs}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0
  return `${h.toString(16)}.png`
}
