import type { ClientModule } from 'claude-code'

// The 🖼 line: drawn by the surface so pointer enter/leave reach it; the hooks module draws the picture.
const PreviewLabel: ClientModule<{ name: string; shown: boolean }> = ({ name, shown }, surface) => {
  const { Text } = surface.elements
  surface.onPointer(ev => {
    if (ev.type === 'enter' || ev.type === 'leave') surface.post(ev.type)
  })
  return <Text dimColor={!shown}>  🖼 {shown ? name : `${name} · hover to preview`}</Text>
}
export default PreviewLabel
