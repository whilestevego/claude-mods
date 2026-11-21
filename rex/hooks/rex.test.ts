import { test, expect } from 'claude-code/testing'

import { isShown, windowOf } from './register'

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

test('windowOf finds the tab that holds a pane', () => {
  const v = JSON.stringify({ windows: [{ window_id: 'w1', layers: [{ blocks: [{ block_id: 'b1' }] }] }, { window_id: 'w2', layers: [{ blocks: [{ block_id: 'b2' }, { block_id: 'b3' }] }] }] })
  expect(windowOf(v, 'b3')).toBe('w2')
  expect(windowOf(v, 'b9')).toBe(undefined)
  expect(windowOf('junk', 'b1')).toBe(undefined)
})
