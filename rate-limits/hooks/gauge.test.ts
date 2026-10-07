import { test, expect } from 'claude-code/testing'

import { color, label, meter, resets, toWarn } from './gauge'

test('meter', () => {
  expect(meter(0)).toBe('▱▱▱▱▱▱▱▱▱▱')
  expect(meter(42)).toBe('▰▰▰▰▱▱▱▱▱▱')
  expect(meter(130)).toBe('▰▰▰▰▰▰▰▰▰▰')
})

test('color and label', () => {
  expect([color(10), color(75), color(90)]).toEqual(['green', 'yellow', 'red'])
  expect([label('five_hour'), label('seven_day'), label('other')]).toEqual(['5h', 'week', 'other'])
})

test('resets: time today, weekday later', () => {
  const now = new Date(2026, 9, 5, 12, 0).getTime()
  expect(resets(new Date(2026, 9, 5, 15, 10).toISOString(), now)).toBe('3:10 PM')
  expect(resets(new Date(2026, 9, 9, 9, 0).toISOString(), now)).toMatch(/^Fri,? 9 AM$/)
  expect(resets(undefined, now)).toBe('')
})

test('warns once per window until it resets', () => {
  const w = [{ kind: 'five_hour', percentUsed: 91, resetsAt: 'A' }, { kind: 'seven_day', percentUsed: 50, resetsAt: 'B' }]
  expect(toWarn(w, [])).toEqual(['five_hour@A'])
  expect(toWarn(w, ['five_hour@A'])).toEqual([])
  expect(toWarn([{ ...w[0]!, resetsAt: 'C' }], ['five_hour@A'])).toEqual(['five_hour@C'])
})
