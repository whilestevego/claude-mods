import { test, expect } from 'claude-code/testing'

import { progress, Progress, runningBar, safe, showCommand, tabTitle, titleAction } from './term'

test('sequences', () => {
  expect(titleAction('✳ Fix Login Bug')).toBe('set_surface_title:✳ Fix Login Bug')
  expect(progress(Progress.value, 42.4)).toBe('\x1b]9;4;1;42\x07')
  expect(progress(Progress.busy)).toBe('\x1b]9;4;3\x07')
  expect(progress(Progress.hide)).toBe('\x1b]9;4;0\x07')
})

test('nothing can inject an escape sequence', () => {
  expect(safe('a\x1b]2;pwned\x07b')).toBe('a ]2;pwned b')
  expect(titleAction('x\x07\x1b')).toBe('set_surface_title:x')
})

test('tab title shows ❓ while waiting', () => {
  expect(tabTitle('Rate Limit Gauge', false)).toBe('✳ Rate Limit Gauge')
  expect(tabTitle('Rate Limit Gauge', true)).toBe('❓ Rate Limit Gauge')
  expect(tabTitle('', true)).toBe('❓ Claude Code')
})

test('the running bar is busy, and red after a failure', () => {
  expect(runningBar(false)).toBe('\x1b]9;4;3\x07')
  expect(runningBar(true)).toBe('\x1b]9;4;2;100\x07')
})

test('showCommand runs the focus script with the tty', () => {
  const command = showCommand('/dev/ttys004')
  expect(command.startsWith("osascript -e 'on run argv")).toBe(true)
  expect(command.endsWith("end run' '/dev/ttys004'")).toBe(true)
})
