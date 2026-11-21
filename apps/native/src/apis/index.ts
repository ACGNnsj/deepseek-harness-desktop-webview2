import type { AppRelease, BridgeManifest, GetManifestPaths } from './index.types'
import { MANIFEST_PATH } from '@/config/constants'
import { isNewerVersion } from '@/utils/app-update'
import { isBridgeManifest, isRecord } from '@/utils/bridge-protocol'

const repo = 'ACGNnsj/deepseek-harness-desktop-webview2'

export async function getManifest(paths: GetManifestPaths, init?: RequestInit): Promise<BridgeManifest | null> {
  const response = await fetch(new URL(MANIFEST_PATH, paths.baseURL).toString(), {
    headers: { Accept: 'application/manifest+json' },
    cache: 'no-store',
    redirect: 'error',
    ...init,
  })

  if (!response.ok)
    return null

  const data: unknown = await response.json()
  return isBridgeManifest(data) ? data : null
}

export async function getLatestAppRelease(platform: string): Promise<AppRelease | null> {
  if (platform !== 'android')
    return null

  // ponytail: only checks the first 100 releases; follow GitHub's Link header if older releases need coverage.
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('App update request timed out'))
      controller.abort()
    }, 10000)
  })

  let releases: unknown
  try {
    const request = fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: controller.signal,
    }).then((response) => {
      if (controller.signal.aborted || !response.ok) {
        controller.abort()
        return null
      }
      return response.json() as Promise<unknown>
    })
    releases = await Promise.race([request, deadline])
  }
  finally {
    clearTimeout(timeout)
  }

  if (!Array.isArray(releases))
    return null

  let latest: AppRelease | null = null
  for (const release of releases) {
    if (!isRecord(release) || release.draft === true || release.prerelease === true || !Array.isArray(release.assets))
      continue
    const tag = release.tag_name
    if (typeof tag !== 'string' || !/^v?\d+(?:\.\d+){2}$/.test(tag))
      continue
    const version = tag.replace(/^v/, '')
    if (latest && !isNewerVersion(version, latest.version))
      continue
    const name = `Deepseek.Harness.Android_${version}.apk`
    const downloadUrl = `https://github.com/${repo}/releases/download/${tag}/${name}`
    if (release.assets.some(asset => isRecord(asset) && asset.name === name && asset.browser_download_url === downloadUrl))
      latest = { version, downloadUrl }
  }
  return latest
}
