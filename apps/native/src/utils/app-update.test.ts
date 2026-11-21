import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLatestAppRelease } from '@/apis'
import { isNewerVersion, parseVersion } from './app-update'

const repo = 'ACGNnsj/deepseek-harness-desktop-webview2'
const apk = 'Deepseek.Harness.Android_0.33.0.apk'
const url = `https://github.com/${repo}/releases/download/v0.33.0/${apk}`

function release(tag: string, name: string, downloadUrl: string, flags = {}) {
  return { tag_name: tag, assets: [{ name, browser_download_url: downloadUrl }], ...flags }
}

describe('parseVersion', () => {
  it('accepts a release tag with or without the v prefix', () => {
    expect(parseVersion('v0.33.0')).toEqual([0, 33, 0])
    expect(parseVersion('0.33.0')).toEqual([0, 33, 0])
  })

  it('drops a pre-release suffix so only the numeric core is compared', () => {
    expect(parseVersion('v0.33.0-beta.2')).toEqual([0, 33, 0])
  })

  it('rejects empty, non-numeric and negative segments', () => {
    expect(parseVersion('')).toBeNull()
    expect(parseVersion('v')).toBeNull()
    expect(parseVersion('latest')).toBeNull()
    expect(parseVersion('0.x.0')).toBeNull()
    expect(parseVersion('0.-1.0')).toBeNull()
  })
})

describe('isNewerVersion', () => {
  it('reports a strictly greater release as an update', () => {
    expect(isNewerVersion('v0.33.0', '0.32.0')).toBe(true)
    expect(isNewerVersion('0.33.0', '0.32.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true)
  })

  it('treats equal versions and the v prefix difference as no update', () => {
    expect(isNewerVersion('v0.32.0', '0.32.0')).toBe(false)
    expect(isNewerVersion('0.32.0', '0.32.0')).toBe(false)
  })

  it('reports an older release as no update', () => {
    expect(isNewerVersion('0.31.9', '0.32.0')).toBe(false)
    expect(isNewerVersion('0.32.0', '0.32.1')).toBe(false)
  })

  it('returns false instead of throwing when either side is not a version', () => {
    expect(isNewerVersion('latest', '0.32.0')).toBe(false)
    expect(isNewerVersion('0.33.0', '')).toBe(false)
    expect(isNewerVersion('', '')).toBe(false)
  })
})

describe('getLatestAppRelease', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each(['headers', 'JSON body'])('aborts stalled %s within the full request deadline', async (phase) => {
    vi.useFakeTimers()
    const response = Response.json([])
    const readBody = vi.spyOn(response, 'json').mockReturnValue(new Promise(() => {}))
    const fetcher = vi.fn<typeof fetch>(async () => {
      if (phase === 'headers')
        return new Promise(() => {})
      await new Promise(resolve => setTimeout(resolve, 9000))
      return response
    })
    vi.stubGlobal('fetch', fetcher)
    const settled = vi.fn()
    void getLatestAppRelease('android').then(settled, settled)

    await vi.advanceTimersByTimeAsync(9999)
    expect(readBody).toHaveBeenCalledTimes(phase === 'headers' ? 0 : 1)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'App update request timed out' }))
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('selects the newest stable fork release with its Android APK', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([
      release('v0.33.0', apk, url),
      release('v0.35.0', 'Desktop.exe', 'https://example.com/Desktop.exe'),
      release('v0.36.0', 'Deepseek.Harness.Android_0.36.0.apk', url.replaceAll('0.33.0', '0.36.0'), { prerelease: true }),
      release('v0.32.0', apk.replace('0.33.0', '0.32.0'), url.replaceAll('0.33.0', '0.32.0')),
      release('v0.37.0', apk.replace('0.33.0', '0.37.0'), url.replaceAll('0.33.0', '0.37.0'), { draft: true }),
    ]))
    vi.stubGlobal('fetch', fetcher)

    await expect(getLatestAppRelease('android')).resolves.toEqual({ version: '0.33.0', downloadUrl: url })
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`https://api.github.com/repos/${repo}/releases?per_page=100`, expect.any(Object))
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('excludes desktop assets, unsigned IPAs, and APK URLs outside the fork', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json([
      release('v0.33.0', apk, url.replace(repo, 'dsh-tauri/deepseek-harness-desktop')),
      release('v0.33.0', 'Deepseek.Harness.iOS_0.33.0_unsigned.ipa', url.replace(apk, 'Deepseek.Harness.iOS_0.33.0_unsigned.ipa')),
      null,
    ])))

    await expect(getLatestAppRelease('android')).resolves.toBeNull()
  })

  it('skips iOS checks until the fork has an installable distribution channel', async () => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)

    await expect(getLatestAppRelease('ios')).resolves.toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
