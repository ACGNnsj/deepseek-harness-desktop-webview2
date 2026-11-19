// @vitest-environment jsdom
import { expect, it } from 'vitest'

it('provides CSSOM identifier escaping for DOM dependencies', () => {
  for (const [value, escaped] of [
    ['', ''],
    ['\0', '\uFFFD'],
    ['\u0001\u007F', '\\1 \\7f '],
    ['0a', '\\30 a'],
    ['-0a', '-\\30 a'],
    ['-', '\\-'],
    ['--a_9', '--a_9'],
    ['a:b c', 'a\\:b\\ c'],
    ['\"\\', '\\\"\\\\'],
    ['中文😀', '中文😀'],
  ] as const) {
    expect(CSS.escape(value)).toBe(escaped)
  }
  expect(window.CSS.escape).toBe(CSS.escape)
})

it('provides browser storage consistently on window and globalThis', () => {
  const key = 'unit-environment-storage'
  expect(window.localStorage).toBeDefined()
  expect(globalThis.localStorage).toBe(window.localStorage)
  window.localStorage.setItem(key, 'persisted')
  expect(globalThis.localStorage.getItem(key)).toBe('persisted')
  expect(globalThis.localStorage.key(0)).toBe(key)
  expect(globalThis.localStorage.length).toBe(1)
  globalThis.localStorage.removeItem(key)
  expect(window.localStorage.getItem(key)).toBeNull()
})
