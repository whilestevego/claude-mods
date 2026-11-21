import { test, expect } from 'claude-code/testing'

import { isShown } from './register'

const S = 'session:01a'
const view = (active: string, focused: string) => JSON.stringify({ active_window_id: active, windows: [{ window_id: 'w1', focused_block_id: focused }, { window_id: 'w2', focused_block_id: 'b2' }] })

test('shown only when Rex is in front, on this session, with this pane focused in the active tab', () => {
  expect(isShown(`true\tHOST/${S}\n`, view('w1', 'b1'), S, 'b1')).toBe(true)
  expect(isShown(`false\tHOST/${S}`, view('w1', 'b1'), S, 'b1')).toBe(false)
  expect(isShown(`true\tHOST/session:other`, view('w1', 'b1'), S, 'b1')).toBe(false)
  expect(isShown(`true\tHOST/${S}`, view('w2', 'b1'), S, 'b1')).toBe(false)
  expect(isShown(`true\tHOST/${S}`, view('w1', 'b9'), S, 'b1')).toBe(false)
  expect(isShown(`true\tHOST/${S}`, 'not json', S, 'b1')).toBe(false)
})
