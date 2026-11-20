// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HarnessContent } from './content'

const harness = vi.hoisted(() => ({ webviewSrc: 'http://localhost:3080', webviewKey: 0 }))

vi.mock('@/store', () => ({ store: { harness } }))
vi.mock('valtio-define', () => ({ useStore: (value: unknown) => value }))
vi.mock('@/utils/window-presentation', () => ({ isHostedDocument: () => false }))
vi.mock('./hosted-content', () => ({ HostedContent: () => null }))

afterEach(() => {
  cleanup()
  harness.webviewKey = 0
  vi.restoreAllMocks()
})

it('replaces the development webview when its generation changes at the same URL', () => {
  const { rerender } = render(<HarnessContent />)
  const original = screen.getByTestId('dsh-harness-webview')

  harness.webviewKey += 1
  rerender(<HarnessContent />)

  const replacement = screen.getByTestId('dsh-harness-webview')
  expect(replacement).not.toBe(original)
  expect(replacement.getAttribute('src')).toBe('http://localhost:3080')
  expect(original.isConnected).toBe(false)
})
