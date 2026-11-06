import type { ClientModule } from 'claude-code'

// Drawn by the surface itself, so it keeps its own colors and isn't inverted on hover like a Button.
const SessionId: ClientModule<{ emoji: string; text: string; copied: boolean }, boolean> = ({ emoji, text, copied }, surface) => {
  const { Text } = surface.elements
  surface.onPointer(ev => {
    if (ev.type === 'enter' || ev.type === 'leave') {
      surface.setState(ev.type === 'enter')
      surface.post(ev.type)
    }
    // Ctrl-click copies the whole resume command; macOS terminals may report it as a right click.
    if (ev.type === 'up') surface.post(ev.ctrl || ev.button === 'right' ? 'copy-command' : 'copy')
  })
  return copied
    ? <Text color="green">✓ Copied</Text>
    : <Text>{emoji} <Text color={surface.state ? 'blue' : undefined} underline>{text.length > 30 ? `${text.slice(0, 29)}…` : text}</Text></Text>
}
export default SessionId
