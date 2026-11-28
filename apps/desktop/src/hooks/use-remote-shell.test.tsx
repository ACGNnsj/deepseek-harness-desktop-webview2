// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRemoteShellMachine } from './use-remote-shell'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

describe('useRemoteShellMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    invoke.mockReset().mockResolvedValue({ machineId: 'm1' })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('每两秒读取壳层远端目标，卸载后停止轮询', async () => {
    const { result, unmount } = renderHook(() => useRemoteShellMachine())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current).toBe('m1')
    expect(invoke).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999)
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(invoke).toHaveBeenCalledTimes(2)

    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(invoke).toHaveBeenCalledTimes(2)
  })
})
