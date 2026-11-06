import type { ClientModule } from 'claude-code'

// The surface draws this itself, so a click reaches the mod without a Button's hover styling.
const Chip: ClientModule<{ text: string; copied: boolean }, boolean> = ({ text, copied }, surface) => {
  const { Text } = surface.elements
  surface.onPointer(ev => {
    if (ev.type === 'enter' || ev.type === 'leave') surface.setState(ev.type === 'enter')
    if (ev.type === 'up') surface.post('copy')
  })
  return copied
    ? <Text color="green">✓ Copied</Text>
    : <Text>🌳 <Text color={surface.state ? 'blue' : undefined} underline>{text}</Text></Text>
}
export default Chip
