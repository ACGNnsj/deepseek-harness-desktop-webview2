import { describe, expect, it } from 'vitest'
import { isNamedTunnelReady, tunnelArgs } from './cloudflared'

const ENTRY = 'http://127.0.0.1:3089'

describe('tunnelArgs', () => {
  it('quick 模式转发本地入口并把协议固定为 http2', () => {
    expect(tunnelArgs(ENTRY)).toEqual(['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', ENTRY])
  })

  it('具名模式只跑 run 子命令，同样固定 http2', () => {
    expect(tunnelArgs()).toEqual(['tunnel', '--no-autoupdate', '--protocol', 'http2', 'run'])
  })

  it('两种模式都不留 cloudflared 缺省的 QUIC（UDP 7844）', () => {
    for (const args of [tunnelArgs(ENTRY), tunnelArgs()]) {
      expect(args).toContain('--protocol')
      expect(args[args.indexOf('--protocol') + 1]).toBe('http2')
    }
  })

  it('具名模式不把入口地址写进参数，凭据只走环境变量', () => {
    expect(tunnelArgs().join(' ')).not.toContain('--url')
  })
})

describe('isNamedTunnelReady', () => {
  it('新版 Registered tunnel connection 算就绪', () => {
    expect(isNamedTunnelReady('INF Registered tunnel connection connIndex=0')).toBe(true)
  })

  it('老版 Connection registered 算就绪', () => {
    expect(isNamedTunnelReady('INF Connection 6ef3 registered with edge')).toBe(true)
  })

  it('启动中的 Tunnel 行与退出时的 Unregistering 都不算就绪', () => {
    expect(isNamedTunnelReady('INF Starting tunnel tunnelID=abc')).toBe(false)
    expect(isNamedTunnelReady('INF Unregistering tunnel connection')).toBe(false)
    expect(isNamedTunnelReady('INF cloudflared version 2026.10.0')).toBe(false)
  })
})
