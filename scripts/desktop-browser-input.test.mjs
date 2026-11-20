import { File } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

const script = readFileSync(new URL('../apps/desktop/src-tauri/src/desktop/browser.js.inc', import.meta.url), 'utf8')

function harness(feedbackError) {
  const outputs = []
  const pending = []
  const notices = []
  const handlers = new Map()
  const registrations = new Map()
  class Element {
    dispatchEvent(event) {
      handlers.get(event.type)?.(event)
      outputs.push(event)
    }
  }
  class DataTransferItem {
    constructor(file) {
      this.kind = 'file'
      this.file = file
    }

    getAsFile() { return this.file }
    webkitGetAsEntry() { return null }
  }
  class DataTransfer {
    constructor() {
      this.items = []
      this.items.add = file => this.items.push(new DataTransferItem(file))
      this.data = new Map()
    }

    get files() { return this.items.map(item => item.getAsFile()) }

    get types() { return ['Files', ...this.data.keys()] }
    setData(key, value) { this.data.set(key, value) }
    getData(key) { return this.data.get(key) || '' }
  }
  class ClipboardEvent {
    constructor(type, options) {
      this.type = type
      Object.assign(this, options)
    }
  }
  const body = new Element()
  const document = {
    body,
    documentElement: { style: {} },
    addEventListener(type, listener) {
      registrations.set(type, (registrations.get(type) || 0) + 1)
      handlers.set(type, listener)
    },
    dispatchEvent(event) { outputs.push(event) },
  }
  const window = {
    DataTransferItem,
    addEventListener() {},
    __TAURI_INTERNALS__: {
      invoke(command, args) {
        if (command === 'show_drop_error') {
          notices.push(args)
          if (feedbackError)
            throw feedbackError
          return Promise.resolve()
        }
        return new Promise((resolve, reject) => pending.push({ command, args, resolve, reject }))
      },
    },
  }
  window.self = window
  window.top = window
  const context = { window, document, DataTransfer, DataTransferItem, File, Element, ClipboardEvent, DragEvent: ClipboardEvent, console: { warn() {}, info() {}, error() {} }, atob, Uint8Array, navigator: { userAgent: 'test' } }
  runInNewContext(script, context)
  function paste(files, plain = '', html = '') {
    const source = new DataTransfer()
    for (const file of files)
      source.items.add(file)
    source.setData('text/plain', plain)
    source.setData('text/html', html)
    const event = {
      clipboardData: source,
      target: body,
      preventDefault() { this.prevented = true },
      stopPropagation() {},
    }
    handlers.get('paste')(event)
    return { source, event }
  }
  return {
    window,
    outputs,
    pending,
    notices,
    paste,
    reinject() { runInNewContext(script, context) },
    registrations,
  }
}

it('dispatches Files pastes in arrival order when path IPC completes in reverse order', async () => {
  const h = harness()
  h.paste([new File(['first'], 'first.png', { type: 'image/png' })])
  h.paste([new File(['second'], 'second.png', { type: 'image/png' })])
  expect(h.pending).toHaveLength(2)
  h.pending[1].resolve([])
  await setImmediate()
  expect(h.outputs).toHaveLength(0)
  h.pending[0].resolve([])
  await setImmediate()
  expect(h.outputs.map(event => event.clipboardData.files[0].name)).toEqual(['first.png', 'second.png'])
})

it('recovers rejected path IPC using captured File and text before dispatching later pastes', async () => {
  const h = harness()
  const first = new File(['original bytes'], 'first.txt', { type: 'text/plain', lastModified: 123 })
  const captured = h.paste([first], 'plain text', '<b>html text</b>')
  captured.source.items.length = 0
  captured.source.data.clear()
  h.paste([new File(['next'], 'next.txt')])
  h.pending[1].resolve([])
  h.pending[0].reject(new Error('clipboard denied'))
  await setImmediate()
  expect(h.outputs).toHaveLength(2)
  const transfer = h.outputs[0].clipboardData
  expect(transfer.files[0]).toBe(first)
  expect(await transfer.files[0].text()).toBe('original bytes')
  expect(transfer.getData('text/plain')).toBe('plain text')
  expect(transfer.getData('text/html')).toBe('<b>html text</b>')
  expect(h.outputs[1].clipboardData.files[0].name).toBe('next.txt')
})

it('preserves image File bytes and directory/non-image paths without synthetic paste recursion or duplicate injection', async () => {
  const h = harness()
  h.reinject()
  expect(h.registrations.get('paste')).toBe(1)
  const image = new File(['image bytes'], 'photo.png', { type: 'image/png', lastModified: 456 })
  const text = new File(['document bytes'], 'readme.txt', { type: 'text/plain' })
  const { event } = h.paste([image, text, new File([], 'folder')], 'plain', '<i>html</i>')
  expect(event.prevented).toBe(true)
  expect(h.pending).toHaveLength(1)
  h.pending[0].resolve([
    { name: 'photo.png', path: '/fixture/photo.png', is_dir: false },
    { name: 'readme.txt', path: '/fixture/readme.txt', is_dir: false },
    { name: 'folder', path: '/fixture/folder', is_dir: true },
  ])
  await setImmediate()
  expect(h.outputs).toHaveLength(1)
  expect(h.pending).toHaveLength(1)
  const transfer = h.outputs[0].clipboardData
  expect(transfer.files[0]).toBe(image)
  expect(await transfer.files[0].text()).toBe('image bytes')
  expect(transfer.files[0].lastModified).toBe(456)
  expect(transfer.files[1]).toBe(text)
  expect(h.window.__DSH_HOST_PATHS__.pathFor(transfer.files[1])).toBe('/fixture/readme.txt')
  expect(h.window.__DSH_HOST_PATHS__.pathFor(transfer.files[2])).toBe('/fixture/folder')
  expect(transfer.items[2].webkitGetAsEntry().isDirectory).toBe(true)
  expect(transfer.getData('text/plain')).toBe('plain')
  expect(transfer.getData('text/html')).toBe('<i>html</i>')
})

it('reports a failed single image drop with its filename', async () => {
  const h = harness()
  const drop = h.window.__dshShellDropAnnounce([{ path: '/fixture/broken.png', isDir: false }])
  h.pending[0].reject(new Error('DROP_BYTES_TOO_LARGE'))
  await drop
  expect(h.notices).toHaveLength(1)
  expect(h.notices[0].message).toContain('broken.png')
  expect(h.outputs).toHaveLength(0)
})

it('dispatches successful drop files when the feedback IPC throws', async () => {
  const h = harness(new Error('feedback unavailable'))
  const drop = h.window.__dshShellDropAnnounce([
    { path: '/fixture/broken.png', isDir: false },
    { path: '/fixture/readme.txt', isDir: false },
  ])
  h.pending[0].reject(new Error('DROP_BYTES_READ'))
  await drop
  expect(h.outputs).toHaveLength(1)
  expect(h.outputs[0].dataTransfer.files.map(file => file.name)).toEqual(['readme.txt'])
})

it('reports failed images while dispatching successful mixed-drop files', async () => {
  const h = harness()
  const drop = h.window.__dshShellDropAnnounce([
    { path: '/fixture/broken.png', isDir: false },
    { path: '/fixture/good.png', isDir: false },
    { path: '/fixture/readme.txt', isDir: false },
    { path: '/fixture/folder', isDir: true },
  ])
  h.pending[0].reject(new Error('DROP_BYTES_READ'))
  await setImmediate()
  h.pending[1].resolve(btoa('good image bytes'))
  await drop
  expect(h.notices).toHaveLength(1)
  expect(h.notices[0].message).toContain('broken.png')
  expect(h.outputs).toHaveLength(1)
  const transfer = h.outputs[0].dataTransfer
  expect(transfer.files.map(file => file.name)).toEqual(['good.png', 'readme.txt', 'folder'])
  expect(await transfer.files[0].text()).toBe('good image bytes')
  expect(h.window.__DSH_HOST_PATHS__.pathFor(transfer.files[1])).toBe('/fixture/readme.txt')
  expect(transfer.items[2].webkitGetAsEntry().isDirectory).toBe(true)
})
