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

  const dropFilePaths = new WeakMap()
  let pendingDrop = null
  let pendingDropPaths = null
  let dropSubscription

  function linkDropPaths() {
    if (pendingDrop === null || pendingDropPaths === null) return
    if (Date.now() - pendingDrop.at > 2000 || Date.now() - pendingDropPaths.at > 2000) {
      pendingDrop = null
      return
    }
    const count = Math.min(pendingDrop.files.length, pendingDropPaths.paths.length)
    for (let index = 0; index < count; index += 1) {
      dropFilePaths.set(pendingDrop.files[index], pendingDropPaths.paths[index])
    }
    pendingDrop = null
  }

  function watchDropPaths() {
    if (!dropSubscription) {
      const handler = ipc.transformCallback((event) => {
        const payload = event && event.payload
        if (payload && payload.type === 'drop' && Array.isArray(payload.paths)) {
          pendingDropPaths = { at: Date.now(), paths: payload.paths }
          linkDropPaths()
        }
      })
      dropSubscription = ipc.invoke('plugin:event|listen', {
        event: 'tauri://drag-drop',
        target: { kind: 'Webview', label: ipc.metadata.currentWebview.label },
        handler,
      }).catch(() => {
        ipc.unregisterCallback(handler)
        dropSubscription = undefined
      })
    }
    return dropSubscription
  }

  window.addEventListener('drop', (event) => {
    const transfer = event && event.dataTransfer
    if (transfer && transfer.types.includes('Files')) {
      pendingDrop = { at: Date.now(), files: [...transfer.files] }
      watchDropPaths()
      linkDropPaths()
      if (pendingDrop !== null) {
        console.debug('[dsh-host-paths] drop without fresh shell paths')
      }
    } else {
      pendingDrop = null
    }
  }, true)

  watchDropPaths()

  window.__DSH_HOST_PATHS__ = {
    pathFor(file) {
      return dropFilePaths.get(file) ?? ''
    },
  }
})()
