import type { AndroidConfig, ExportedConfig } from 'expo/config-plugins'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig } from 'expo/config'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const packageVersion = (JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as { version: string }).version

const mainActivityTemplate = `package com.dshtauri.dshbridge

import android.os.Bundle

import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"
}
`

function moddedConfig() {
  return getConfig(projectRoot, { isModdedConfig: true, skipSDKVersionRequirement: true }).exp as ExportedConfig
}

function modRequest(modName: string) {
  return { projectRoot, platformProjectRoot: resolve(projectRoot, 'android'), modName, platform: 'android' as const, introspect: true }
}

async function patchMainActivity(contents: string) {
  const config = moddedConfig()
  const mod = config.mods?.android?.mainActivity
  if (!mod)
    throw new Error('app.config.js registers no Android mainActivity mod')
  const result = await mod({ ...config, modRawConfig: config, modRequest: modRequest('mainActivity'), modResults: { path: 'MainActivity.kt', language: 'kt', contents } })
  return result.modResults.contents
}

describe('public Expo configuration packaged by expo-constants', () => {
  it('embeds the complete third-party notice and derives the package version', () => {
    const { exp } = getConfig(projectRoot, { isPublicConfig: true, skipSDKVersionRequirement: true })

    expect(exp.extra?.thirdPartyNotices).toBe(readFileSync(resolve(projectRoot, '../../THIRD_PARTY_NOTICES.md'), 'utf8'))
    expect(exp.version).toBe(packageVersion)
  })
})

describe('android orientation generated at prebuild', () => {
  it('replaces the portrait lock that Expo writes on MainActivity with fullUser', async () => {
    const config = moddedConfig()
    const mod = config.mods?.android?.manifest
    if (!mod)
      throw new Error('app.config.js registers no Android manifest mod')
    const manifest: AndroidConfig.Manifest.AndroidManifest = {
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        queries: [],
        application: [{
          $: { 'android:name': '.MainApplication' },
          activity: [{ $: { 'android:name': '.MainActivity', 'android:screenOrientation': 'portrait' } }],
        }],
      },
    }

    const result = await mod({ ...config, modRawConfig: config, modRequest: modRequest('manifest'), modResults: manifest })

    expect(result.modResults.manifest.application?.[0]?.activity?.[0]?.$['android:screenOrientation']).toBe('fullUser')
  })

  it('locks MainActivity to portrait below a 600dp smallest width and to fullUser otherwise', async () => {
    expect(await patchMainActivity(mainActivityTemplate)).toContain([
      '  private fun applyScreenOrientation(config: android.content.res.Configuration) {',
      '    requestedOrientation = if (config.smallestScreenWidthDp < 600) {',
      '      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT',
      '    } else {',
      '      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_USER',
      '    }',
      '  }',
    ].join('\n'))
  })

  it('applies the orientation before MainActivity calls super.onCreate', async () => {
    expect(await patchMainActivity(mainActivityTemplate)).toContain('    applyScreenOrientation(resources.configuration)\n    super.onCreate(null)\n')
  })

  it('re-applies the orientation when the configuration changes, such as a foldable unfolding', async () => {
    expect(await patchMainActivity(mainActivityTemplate)).toContain([
      'class MainActivity : ReactActivity() {',
      '',
      '  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {',
      '    super.onConfigurationChanged(newConfig)',
      '    applyScreenOrientation(newConfig)',
      '  }',
    ].join('\n'))
  })

  it('leaves an already patched MainActivity unchanged when prebuild runs again', async () => {
    const patched = await patchMainActivity(mainActivityTemplate)

    expect(await patchMainActivity(patched)).toBe(patched)
  })

  it('fails prebuild when MainActivity no longer matches the Expo template', async () => {
    const changed = mainActivityTemplate.replace('class MainActivity : ReactActivity() {', 'class MainActivity : ReactActivity(), Runnable {')

    await expect(patchMainActivity(changed)).rejects.toThrow('MainActivity.kt no longer matches the Expo template')
  })
})
