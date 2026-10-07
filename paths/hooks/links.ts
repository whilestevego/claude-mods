// Finding file references in Claude's markdown and turning the real ones into links.

export type Ref = { path: string; line?: number; col?: number }

// A path: an optional ~/, ./, ../ or / start, then segments, not ending in a dot (that ends the sentence).
// It needs a slash or a file extension to count.
const PATH = String.raw`(?:~\/|\.{1,2}\/|\/)?(?:[\w@+-][\w@.+-]*\/)*[\w@+-](?:[\w@.+-]*[\w@+-])?`
const REF = new RegExp(String.raw`(\x60?)(${PATH})(?::(\d+)(?::(\d+))?)?\1(?![\w@\/])`, 'g')

/** Fenced code, inline links and URLs stay as they are: only the prose between them is searched. */
function proseSpans(markdown: string): Array<{ text: string; isProse: boolean }> {
  const out: Array<{ text: string; isProse: boolean }> = []
  const skip = /```[\s\S]*?(?:```|$)|\[[^\]\n]*\]\([^)\n]*\)|<?[a-z][a-z0-9+.-]*:\/\/[^\s)>]+>?/gi
  let last = 0
  for (const m of markdown.matchAll(skip)) {
    out.push({ text: markdown.slice(last, m.index), isProse: true }, { text: m[0], isProse: false })
    last = m.index! + m[0].length
  }
  out.push({ text: markdown.slice(last), isProse: true })
  return out
}

const looksLikePath = (p: string) => p.includes('/') || /\.[A-Za-z0-9]{1,10}$/.test(p)

/** Every path-like reference in the prose, deduplicated by path. Whether it exists is checked later. */
export function findRefs(markdown: string): string[] {
  const paths = new Set<string>()
  for (const span of proseSpans(markdown)) {
    if (!span.isProse) continue
    for (const m of span.text.matchAll(REF)) if (looksLikePath(m[2]!)) paths.add(m[2]!)
  }
  return [...paths]
}

/** The markdown with each reference to an existing file (`resolved`: path → absolute) made a link. */
export function linkify(markdown: string, resolved: ReadonlyMap<string, string>, href: (abs: string, ref: Ref) => string): string {
  return proseSpans(markdown)
    .map(span =>
      span.isProse
        ? span.text.replace(REF, (whole, _tick: string, path: string, line?: string, col?: string) => {
            const abs = resolved.get(path)
            if (!abs) return whole
            const ref: Ref = { path, line: line ? Number(line) : undefined, col: col ? Number(col) : undefined }
            return `[${whole}](${href(abs, ref)})`
          })
        : span.text,
    )
    .join('')
}

/** Where a click goes: the file itself, or an editor at the line. */
export function hrefFor(openWith: string, abs: string, ref: Ref): string {
  const path = encodeURI(abs)
  const at = ref.line ? `:${ref.line}${ref.col ? `:${ref.col}` : ''}` : ''
  if (openWith === 'zed') return `zed://file${path}${at}`
  if (openWith === 'vscode' || openWith === 'cursor') return `${openWith}://file${path}${at}`
  return `file://${path}`
}

/** `~/x`, `/x` or a path relative to the session's folder → absolute. */
export function absolute(path: string, cwd: string, home: string): string {
  if (path.startsWith('~/')) return home + path.slice(1)
  if (path.startsWith('/')) return path
  const parts = `${cwd}/${path}`.split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p && p !== '.') out.push(p)
  }
  return '/' + out.join('/')
}
