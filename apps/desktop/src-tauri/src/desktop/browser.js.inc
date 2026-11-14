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
  const ROW_KEY_ATTR = 'data-row-key'
  const POINTER_DRAG_PX = 6
  let rowFlight = null
  let suppressRowClick = false
  let firingSyntheticDrag = false

  function asDragRow(element) {
    const row = element instanceof Element ? element.closest(`[${ROW_KEY_ATTR}]`) : null
    if (row === null) return null
    const key = row.getAttribute(ROW_KEY_ATTR) ?? ''
    if (!key.startsWith('workspace:') && !key.startsWith('session:')) return null
    if (row.getAttribute('draggable') !== 'true') return null
    return row
  }

  function fireRowDrag(type, row, clientX, clientY, transfer) {
    const event = new DragEvent(type, { bubbles: true, cancelable: true, clientX, clientY })
    Object.defineProperty(event, 'dataTransfer', { value: transfer, configurable: true })
    firingSyntheticDrag = true
    try { row.dispatchEvent(event) } finally { firingSyntheticDrag = false }
  }

  function endRowFlight(target, suppress) {
    const flight = rowFlight
    rowFlight = null
    document.documentElement.style.userSelect = ''
    document.documentElement.style.cursor = ''
    if (flight === null || flight.transfer === null) return
    if (suppress) suppressRowClick = true
    if (target !== null) fireRowDrag('drop', target, flight.lastX, flight.lastY, flight.transfer)
    fireRowDrag('dragend', flight.source, flight.lastX, flight.lastY, flight.transfer)
  }

  // keep:effect sidebar pointer-drag flight replaces the dead native loop with synthetic DnD
  document.addEventListener('pointerdown', (e) => {
    suppressRowClick = false
    if (e.button !== 0 || !e.isPrimary || e.pointerType !== 'mouse') return
    const target = e.target instanceof Element ? e.target : null
    if (target === null || target.closest('button, a, input, textarea, select, [role="menu"], [role="menuitem"], [contenteditable="true"]') !== null) return
    const row = asDragRow(target)
    if (row === null) return
    rowFlight = { source: row, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, transfer: null }
  })

  window.addEventListener('pointermove', (e) => {
    if (rowFlight === null || !e.isPrimary) return
    rowFlight.lastX = e.clientX
    rowFlight.lastY = e.clientY
    if (Math.hypot(e.clientX - rowFlight.startX, e.clientY - rowFlight.startY) <= POINTER_DRAG_PX) return
    if (rowFlight.transfer === null) {
      rowFlight.transfer = new DataTransfer()
      document.documentElement.style.userSelect = 'none'
      document.documentElement.style.cursor = 'grabbing'
      fireRowDrag('dragstart', rowFlight.source, e.clientX, e.clientY, rowFlight.transfer)
    }
    const row = asDragRow(document.elementFromPoint(e.clientX, e.clientY))
    if (row !== null) fireRowDrag('dragover', row, e.clientX, e.clientY, rowFlight.transfer)
  })

  window.addEventListener('pointerup', (e) => {
    if (rowFlight === null || !e.isPrimary) return
    rowFlight.lastX = e.clientX
    rowFlight.lastY = e.clientY
    endRowFlight(asDragRow(document.elementFromPoint(e.clientX, e.clientY)), true)
  })

  window.addEventListener('pointercancel', () => { endRowFlight(null, false) })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') endRowFlight(null, false)
  })

  document.addEventListener('click', (e) => {
    if (!suppressRowClick) return
    suppressRowClick = false
    e.preventDefault()
    e.stopPropagation()
  }, true)

  document.addEventListener('dragstart', (e) => {
    if (firingSyntheticDrag || asDragRow(e.target) === null) return
    e.preventDefault()
    e.stopPropagation()
  }, true)

  async function resolvePaste(event) {
    const source = event.clipboardData
    if (!source) return
    const incoming = [...source.items].filter((item) => item.kind === 'file')
    if (incoming.length === 0) return
    const target = event.target instanceof Element ? event.target : document.body
    const plain = source.getData('text/plain')
    const html = source.getData('text/html')
    const resume = (transfer) => {
      const resumed = new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true })
      Object.defineProperty(resumed, 'clipboardData', { value: transfer, configurable: true })
      target.dispatchEvent(resumed)
    }
    event.preventDefault()
    event.stopPropagation()
    let paths = []
    try {
      const tauri = window.__TAURI__ && window.__TAURI__.core
      if (!tauri || typeof tauri.invoke !== 'function') throw new Error('invoke unavailable')
      const listed = await tauri.invoke('read_clipboard_file_paths')
      if (Array.isArray(listed)) paths = listed
    } catch {
      resume(source)
      return
    }
    const remaining = new Map()
    for (const entry of paths) {
      if (!entry || typeof entry.path !== 'string' || typeof entry.name !== 'string') continue
      const list = remaining.get(entry.name) || []
      list.push(entry)
      remaining.set(entry.name, list)
    }
    const take = (name, isDir) => {
      const list = remaining.get(name)
      if (!list || list.length === 0) return null
      const at = list.findIndex((entry) => (entry.is_dir === true) === isDir)
      if (at === -1) return null
      const found = list.splice(at, 1)[0]
      return found || null
    }
    const transfer = new DataTransfer()
    for (const item of incoming) {
      let file = null
      try { file = item.getAsFile() } catch { file = null }
      let nativeEntry = null
      try { nativeEntry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null } catch { nativeEntry = null }
      const isDir = nativeEntry !== null && nativeEntry.isDirectory === true
      const name = (file && file.name) || (nativeEntry && nativeEntry.name) || ''
      if (name === '') continue
      const match = take(name, isDir)
      if (isDir) {
        if (!match || match.is_dir !== true) {
          console.warn(`[dsh-host-paths] paste dir unresolved: ${name}`)
          continue
        }
        const vessel = new File([], match.name, { type: '' })
        dropPathByFile.set(vessel, match.path)
        dropDirByFile.set(vessel, true)
        transfer.items.add(vessel)
        continue
      }
      if (file === null) continue
      if (match && match.is_dir !== true) dropPathByFile.set(file, match.path)
      transfer.items.add(file)
    }
    if (plain !== '') transfer.setData('text/plain', plain)
    if (html !== '') transfer.setData('text/html', html)
    if (transfer.files.length === 0 && plain === '' && html === '') {
      resume(source)
      return
    }
    resume(transfer)
  }

  // keep:effect paste takes over file payloads to resolve shell paths before the editor reads them
  document.addEventListener('paste', (event) => { void resolvePaste(event) }, true)

})()