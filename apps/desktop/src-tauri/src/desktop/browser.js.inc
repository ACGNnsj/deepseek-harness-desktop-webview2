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
  const redispatchedDrops = new WeakSet()
  let heldDrop = null
  let pendingDropPaths = null
  let dropSubscription

  function linkDropPaths() {
    if (heldDrop === null || pendingDropPaths === null) return false
    if (Date.now() - heldDrop.at > 2000 || Date.now() - pendingDropPaths.at > 2000) return false
    const count = Math.min(heldDrop.files.length, pendingDropPaths.paths.length)
    for (let index = 0; index < count; index += 1) {
      dropFilePaths.set(heldDrop.files[index], pendingDropPaths.paths[index])
    }
    return true
  }

  function releaseDrop() {
    const held = heldDrop
    heldDrop = null
    if (held === null || redispatchedDrops.has(held.event)) return
    redispatchedDrops.add(held.event)
    const target = held.target.isConnected ? held.target : document
    target.dispatchEvent(held.event)
  }

  function settleDropPaths() {
    if (heldDrop !== null && linkDropPaths()) releaseDrop()
  }

  function watchDropPaths() {
    if (!dropSubscription) {
      const handler = ipc.transformCallback((event) => {
        const payload = event && event.payload
        if (payload && payload.type === 'drop' && Array.isArray(payload.paths)) {
          console.info(`[dsh-host-paths] shell drop paths: ${payload.paths.length}`)
          pendingDropPaths = { at: Date.now(), paths: payload.paths }
          settleDropPaths()
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
    if (redispatchedDrops.has(event)) return
    const transfer = event && event.dataTransfer
    const types = (transfer && transfer.types) || []
    if (!transfer || !types.includes('Files')) return
    if (heldDrop !== null) releaseDrop()
    watchDropPaths()
    heldDrop = { at: Date.now(), files: [...transfer.files], event, target: event.target }
    console.info(`[dsh-host-paths] dom drop files: ${heldDrop.files.length}`)
    if (linkDropPaths()) {
      heldDrop = null
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const waitStart = Date.now()
    const pump = () => {
      if (heldDrop === null) return
      if (linkDropPaths()) {
        releaseDrop()
        return
      }
      if (Date.now() - waitStart > 800) {
        console.info('[dsh-host-paths] drop released without shell paths')
        releaseDrop()
        return
      }
      setTimeout(pump, 50)
    }
    setTimeout(pump, 50)
  }, true)

  watchDropPaths()

  window.__DSH_HOST_PATHS__ = {
    pathFor(file) {
      return dropFilePaths.get(file) ?? ''
    },
  }
})()
