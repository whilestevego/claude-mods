import type { ClientModule } from 'claude-code'

export type BarView = {
  runs: { text: string; color: string }[]
  label: string
  legend: { color: string; name: string; tokens: string }[]
}

// Drawn by the surface so it gets pointer enter/leave (a Box hover doesn't register here).
// While the pointer is over it, the bar's own row shows the legend instead: same height, nothing moves.
const ContextBar: ClientModule<BarView, boolean> = ({ runs, label, legend }, surface) => {
  const { Text } = surface.elements
  surface.onPointer(ev => {
    if (ev.type === 'enter' || ev.type === 'leave') surface.setState(ev.type === 'enter')
  })
  return surface.state ? (
    <Text wrap="truncate">
      {legend.map(s => (
        <Text>
          <Text color={s.color}>■</Text> {s.name} <Text dimColor>{s.tokens}</Text>{'  '}
        </Text>
      ))}
    </Text>
  ) : (
    <Text wrap="truncate">
      {runs.map(r => <Text color={r.color}>{r.text}</Text>)}
      <Text dimColor>{label}</Text>
    </Text>
  )
}
export default ContextBar
