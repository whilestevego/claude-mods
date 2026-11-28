// Where each Claude session lives in Rex, saved as it goes, so /rex-restore can bring the sessions back after Rex loses them.

/** One conversation's place in Rex. `root` is where `claude --resume` finds it. */
export type Spot = {
  sessionId: string
  root: string
  rexSession: string
  sessionLabel: string
  window: string
  tab: string
  tabIndex: number
  block: string
  savedAt: number
}

type View = { label?: string; windows?: { window_id: string; label?: string; layers?: { blocks?: { block_id: string }[] }[] }[] }

const parse = (json: string): View | undefined => {
  try {
    return JSON.parse(json) as View
  } catch {
    return undefined
  }
}

/** The tab that holds `block`, from `rex session inspect --json`. */
export function placeOf(view: string, block: string): Pick<Spot, 'sessionLabel' | 'window' | 'tab' | 'tabIndex'> | undefined {
  const v = parse(view)
  const windows = v?.windows ?? []
  const i = windows.findIndex(w => w.layers?.some(l => l.blocks?.some(b => b.block_id === block)))
  const w = windows[i]
  return w ? { sessionLabel: v?.label ?? '', window: w.window_id, tab: w.label ?? '', tabIndex: i } : undefined
}

/** Each tab of a session: its label and its panes, from `rex session inspect --json`. */
export function tabsOf(view: string): { window: string; tab: string; blocks: string[] }[] {
  return (parse(view)?.windows ?? []).map(w => ({
    window: w.window_id,
    tab: w.label ?? '',
    blocks: (w.layers ?? []).flatMap(l => (l.blocks ?? []).map(b => b.block_id)),
  }))
}

const SHELL = /^-?(\S*\/)?(zsh|bash|fish|sh|nu)$/

/**
 * `ps -E -ax -o pid=,stat=,command=` lines → the panes at a shell prompt (every foreground process is a shell) and
 * the pid of each Claude, with its pane when it runs in one.
 */
export function readPs(ps: string): { idle: Set<string>; claudes: { pid: string; block?: string }[] } {
  const fg = new Map<string, boolean>()
  const claudes: { pid: string; block?: string }[] = []
  for (const line of ps.split('\n')) {
    const [pid, stat, prog] = line.trim().split(/\s+/)
    if (!pid || !stat || !prog) continue
    const block = /\bREX_BLOCK=(block:\S+)/.exec(line)?.[1]
    if (/(^|\/)claude$/.test(prog)) claudes.push({ pid, block })
    if (block && stat.includes('+')) fg.set(block, (fg.get(block) ?? true) && SHELL.test(prog))
  }
  return { idle: new Set([...fg].filter(([, isShell]) => isShell).map(([b]) => b)), claudes }
}

/** Claude Code's record of a running session (~/.claude/sessions/<pid>.json) → its conversation ID. */
export function conversationOf(record: string): string | undefined {
  try {
    const id = (JSON.parse(record) as { sessionId?: unknown }).sessionId
    return typeof id === 'string' ? id : undefined
  } catch {
    return undefined
  }
}

export function parseSpot(text: string): Spot | undefined {
  try {
    const s = JSON.parse(text) as Spot
    return typeof s.sessionId === 'string' && typeof s.root === 'string' && typeof s.block === 'string' ? s : undefined
  } catch {
    return undefined
  }
}

const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`

/** What gets typed into the pane's shell, so Claude runs with your PATH and the tab stays when it exits. */
export const resumeCommand = (s: Pick<Spot, 'root' | 'sessionId'>) => `cd ${quote(s.root)} && claude --resume ${s.sessionId}\r`

/**
 * Where each session goes back: its own pane when that is at a prompt, else an idle pane in a tab with its old name
 * in its old session, else a new pane. Each pane takes one session. Sessions come in tab order, so new tabs keep it.
 */
export type Target = { kind: 'pane'; block: string; rexSession: string } | { kind: 'new' }

export function plan(
  lost: readonly Spot[],
  idle: ReadonlySet<string>,
  tabs: ReadonlyMap<string, { window: string; tab: string; blocks: string[] }[]>,
): { spot: Spot; target: Target }[] {
  const taken = new Set<string>()
  const free = (b: string) => idle.has(b) && !taken.has(b)
  return [...lost]
    .sort((a, b) => a.sessionLabel.localeCompare(b.sessionLabel) || a.tabIndex - b.tabIndex)
    .map(spot => {
      const sameTab = (tabs.get(spot.rexSession) ?? []).find(t => t.tab && t.tab === spot.tab && t.blocks.some(free))
      const block = free(spot.block) ? spot.block : sameTab?.blocks.find(free)
      if (!block) return { spot, target: { kind: 'new' } as const }
      taken.add(block)
      return { spot, target: { kind: 'pane', block, rexSession: spot.rexSession } as const }
    })
}
