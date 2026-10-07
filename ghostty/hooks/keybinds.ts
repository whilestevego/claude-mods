// Ghostty keybinds that type into Claude, kept in their own file the main Ghostty config includes.

export type Binding = { keys: string; text: string }

export const HEADER = [
  '# Ghostty keys that type into Claude Code, managed with /keybind (the ghostty Claude mod).',
  '# Loaded by `config-file = ?claude-keybinds` in your Ghostty config. Edits by hand are kept.',
]

/** The line that makes the main config load this file; `?` means a missing file is fine. */
export const INCLUDE = 'config-file = ?claude-keybinds'

/** What every new install starts with. */
export const DEFAULTS: Binding[] = [{ keys: 'super+ctrl+g', text: '/goto' }]

/** Ghostty's `text:` action takes a Zig string literal: backslashes doubled, then Enter as \r. */
export function bindingLine(b: Binding): string {
  return `keybind = ${b.keys}=text:${b.text.replace(/\\/g, '\\\\')}\\r`
}

/** The bindings a keybinds file holds (only `text:` ones ending in Enter are this mod's shape). */
export function parseBindings(file: string): Binding[] {
  const out: Binding[] = []
  for (const line of file.split('\n')) {
    const m = /^\s*keybind\s*=\s*([^=\s]+)=text:(.*)\\r\s*$/.exec(line)
    if (m) out.push({ keys: m[1]!, text: m[2]!.replace(/\\\\/g, '\\') })
  }
  return out
}

/** The whole file for `bindings`, keeping any other lines you wrote by hand. */
export function renderFile(previous: string, bindings: readonly Binding[]): string {
  const mine = previous.split('\n').filter(l => l.trim() && !HEADER.includes(l) && !/^\s*keybind\s*=\s*[^=\s]+=text:.*\\r\s*$/.test(l))
  return [...HEADER, ...mine, ...bindings.map(bindingLine)].join('\n') + '\n'
}

/** Adds or replaces the binding for `keys`. */
export function upsert(bindings: readonly Binding[], b: Binding): Binding[] {
  return [...bindings.filter(x => x.keys !== b.keys), b]
}

/** `super+ctrl+g` → `⌘⌃G`, for display. */
export function prettyKeys(keys: string): string {
  const sym: Record<string, string> = { super: '⌘', cmd: '⌘', ctrl: '⌃', alt: '⌥', opt: '⌥', shift: '⇧' }
  return keys.split('+').map(k => sym[k] ?? k.toUpperCase()).join('')
}

/** `/keybind add <keys> <text…>` → a binding, or why not. */
export function parseAdd(args: string): Binding | string {
  const [keys, ...rest] = args.trim().split(/\s+/)
  const text = rest.join(' ')
  if (!keys || !text) return 'Usage: /keybind add <keys> <text>, e.g. /keybind add super+ctrl+h /hush'
  if (!/^[a-z0-9_+.,;'\[\]\/`-]+$/i.test(keys)) return `"${keys}" isn't a Ghostty key combination (like super+ctrl+g)`
  if (/[\u0000-\u001f\u007f]/.test(text)) return 'The text can\'t contain control characters'
  return { keys: keys.toLowerCase(), text }
}

/** The main Ghostty config with the include line added once. */
export function withInclude(config: string): string {
  if (config.split('\n').some(l => l.trim() === INCLUDE)) return config
  return `${config.replace(/\n*$/, '\n')}\n# Claude Code keybinds (/keybind)\n${INCLUDE}\n`
}
