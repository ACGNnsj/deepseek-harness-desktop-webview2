(() => {
  if (window.self !== window.top) return
  const ipc = window.__TAURI_INTERNALS__
  const listeners = new Map()
  let subscription

  function subscribe() {
    if (!subscription) {
      const handler = ipc.transformCallback(({ payload }) => {
        for (const listener of [...(listeners.get(payload.lease) ?? [])]) {
          try { listener(payload.url) }
          catch (error) { console.error('Desktop browser link handler failed', error) }
        }
      })
      subscription = ipc.invoke('plugin:event|listen', {
        event: 'dsh-browser-open-requested',
        target: { kind: 'Webview', label: ipc.metadata.currentWebview.label },
        handler,
      }).catch((error) => {
        ipc.unregisterCallback(handler)
        subscription = undefined
        throw error
      })
    }
    return subscription
  }

  window.dshDesktop = {
    ...window.dshDesktop,
    protocolVersion: 1,
    deviceInfo: async () => navigator.userAgent,
    browser: {
      async acquire(workspace) {
        await subscribe()
        return ipc.invoke('acquire_browser_guest', { workspace })
      },
      async release(lease) {
        await ipc.invoke('release_browser_guest', { lease })
        listeners.delete(lease)
      },
      onOpenRequested(lease, listener) {
        let callbacks = listeners.get(lease)
        if (!callbacks) {
          callbacks = new Set()
          listeners.set(lease, callbacks)
        }
        callbacks.add(listener)
        return () => {
          callbacks.delete(listener)
          if (!callbacks.size && listeners.get(lease) === callbacks)
            listeners.delete(lease)
        }
      },
    },
  }

  const dropPathByFile = new WeakMap()
  const dropDirByFile = new WeakMap()

  function mimeOf(name) {
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
    if (ext === 'png') return 'image/png'
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
    if (ext === 'gif') return 'image/gif'
    if (ext === 'webp') return 'image/webp'
    if (ext === 'svg') return 'image/svg+xml'
    if (ext === 'bmp') return 'image/bmp'
    if (ext === 'ico') return 'image/x-icon'
    if (ext === 'avif') return 'image/avif'
    return ''
  }

  function bridgeEntries() {
    try {
      const proto = window.DataTransferItem && DataTransferItem.prototype
      const original = proto && proto.webkitGetAsEntry
      if (proto && typeof original === 'function' && !proto.__dshEntryBridge) {
        proto.__dshEntryBridge = true
        proto.webkitGetAsEntry = function () {
          const file = typeof this.getAsFile === 'function' ? this.getAsFile() : null
          if (file && dropDirByFile.has(file)) return { isDirectory: true }
          return original.call(this)
        }
      }
      const probe = new DataTransfer()
      const probeFile = new File([], 'probe')
      dropDirByFile.set(probeFile, true)
      probe.items.add(probeFile)
      const passed = probe.items[0].webkitGetAsEntry()?.isDirectory === true
      dropDirByFile.delete(probeFile)
      console.warn(`[dsh-host-paths] entry bridge ${passed ? 'ready' : 'unavailable'}`)
    } catch {
      console.warn('[dsh-host-paths] entry bridge failed')
    }
  }

  window.__dshShellDropAnnounce = async (items) => {
    if (!Array.isArray(items) || items.length === 0) return
    console.warn(`[dsh-host-paths] shell drop: ${items.length}`)
    const transfer = new DataTransfer()
    for (const item of items) {
      if (!item || typeof item.path !== 'string') continue
      const name = item.path.split(/[/\\]/).pop() || item.path
      if (item.isDir) {
        const file = new File([], name, { type: '' })
        dropPathByFile.set(file, item.path)
        dropDirByFile.set(file, true)
        transfer.items.add(file)
        continue
      }
      const type = mimeOf(name)
      if (type.startsWith('image/')) {
        try {
          const response = await fetch(`http://asset.localhost/${encodeURIComponent(item.path)}`)
          if (!response.ok) throw new Error(String(response.status))
          const blob = await response.blob()
          transfer.items.add(new File([blob], name, { type: blob.type || type }))
        } catch {
          console.warn(`[dsh-host-paths] image skipped: ${name}`)
        }
        continue
      }
      const file = new File([], name, { type })
      dropPathByFile.set(file, item.path)
      transfer.items.add(file)
    }
    if (transfer.files.length === 0) return
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
    console.warn(`[dsh-host-paths] synthetic drop: ${transfer.files.length}`)
  }

  bridgeEntries()

  window.__DSH_HOST_PATHS__ = {
    pathFor(file) {
      return dropPathByFile.get(file) ?? ''
    },
  }
})()