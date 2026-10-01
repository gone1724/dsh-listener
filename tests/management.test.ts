import { createServer } from 'node:http'
import { once } from 'node:events'
import { expect, it, vi } from 'vitest'
import { latestRelease, mountManagement, compareVersions } from '../src/host/management.ts'
import { defaults, validatePreferences, validateUpdateSource } from '../src/shared.ts'

const remote: any = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('/tags?') ? [{ name: 'v0.4.0' }, { name: 'v0.2.1' }, { name: 'v0.5.0-beta' }] : { name: 'dsh-speeker', version: '0.4.0' } }))
it('检查正式版本，验证清单并固定仓库和发布标签', async () => {
  expect(await latestRelease(remote)).toEqual({ version: '0.4.0', spec: 'github:gone1724/dsh-listener#v0.4.0' })
  expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
  await expect(latestRelease(vi.fn(async () => ({ ok: false, status: 429 })) as any)).rejects.toThrow('HTTP 429')
})
it('镜像模式的标签、清单和安装包均使用镜像，不直连 GitHub', async () => {
  const fetcher: any = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('/tags?') ? [{ name: 'v0.4.0' }] : { name: 'dsh-speeker', version: '0.4.0' } }))
  const source = { updateSource: 'mirror' as const, mirrorUrl: 'https://mirror.example/proxy/' }
  expect(await latestRelease(fetcher, source)).toEqual({ version: '0.4.0', spec: 'https://mirror.example/proxy/https://github.com/gone1724/dsh-listener/archive/refs/tags/v0.4.0.tar.gz' })
  expect(fetcher.mock.calls.map((call: any[]) => call[0])).toEqual([
    'https://mirror.example/proxy/https://api.github.com/repos/gone1724/dsh-listener/tags?per_page=100',
    'https://mirror.example/proxy/https://raw.githubusercontent.com/gone1724/dsh-listener/v0.4.0/package.json',
  ])
  await expect(latestRelease(vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('/tags?') ? [{ name: 'v0.4.0' }] : { name: 'another-package', version: '0.4.0' } })) as any, source)).rejects.toThrow('版本不一致')
})
it('旧设置默认官方下载，镜像前缀验证拒绝无效或带凭据的网址', () => {
  const { updateSource, mirrorUrl, ...old } = defaults
  expect(validatePreferences(old)).toEqual(defaults)
  expect(validateUpdateSource({ updateSource: 'official' })).toEqual({ updateSource: 'official', mirrorUrl: '' })
  for (const value of ['', 'http://mirror.example', 'file:///tmp', 'https://user:password@mirror.example', 'https://mirror.example?url=', 'https://mirror.example/#fragment']) {
    expect(() => validateUpdateSource({ updateSource: 'mirror', mirrorUrl: value })).toThrow()
  }
})
it('更新/一键卸载只调用官方管理器操作本插件，并如实返回重启要求', async () => {
  let handler: any, active = 0, rejection: number | undefined
  const manager: any = { installBundle: vi.fn(async () => ({ application: 'restart-required' })), removeBundle: vi.fn(async () => ({ application: 'applied' })) }
  const download = vi.fn(async (_url: string, _version: string, progress: any) => {
    progress({ phase: 'downloading', received: 100, total: 100 })
    return { path: 'F:/test/dsh-speeker-test.tgz', dispose: vi.fn(async () => {}) }
  })
  const ctx: any = { connection: { admit: () => rejection ? { rejection } : { peer: {} } }, webServer: { register: (route: any) => { handler = route.handler; return () => {} } } }
  const dispose = mountManagement(ctx, () => active, remote, async () => manager, download)
  const server = createServer((req, res) => { void handler(req, res) }); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const call = (action: string, source: Record<string, string> = {}) => fetch(`${origin}/dsh-speeker/manage?${new URLSearchParams({ action, ...source })}`, { method: 'POST' })
  try {
    expect((await (await call('check')).json()).available).toBe(true)
    expect((await (await call('update')).json()).application).toBe('restart-required')
    expect(manager.installBundle).toHaveBeenCalledExactlyOnceWith('F:/test/dsh-speeker-test.tgz')
    expect(download.mock.calls[0][0]).toBe('https://github.com/gone1724/dsh-listener/archive/refs/tags/v0.4.0.tar.gz')
    expect((await call('update', { updateSource: 'mirror', mirrorUrl: 'https://mirror.example' })).status).toBe(200)
    expect(download.mock.calls[1][0]).toBe('https://mirror.example/https://github.com/gone1724/dsh-listener/archive/refs/tags/v0.4.0.tar.gz')
    expect((await (await fetch(`${origin}/dsh-speeker/manage?action=progress`)).json())).toEqual({ phase: 'done', received: 100, total: 100 })
    expect((await call('update', { updateSource: 'mirror', mirrorUrl: '' })).status).toBe(400)
    active = 1; expect((await call('uninstall')).status).toBe(409); expect(manager.removeBundle).not.toHaveBeenCalled()
    active = 0; expect((await call('uninstall')).status).toBe(200); expect(manager.removeBundle).toHaveBeenCalledExactlyOnceWith('dsh-speeker')
    rejection = 403; expect((await call('update')).status).toBe(403)
    expect((await fetch(`${origin}/dsh-speeker/manage?action=progress`)).status).toBe(403)
    expect(manager.installBundle).toHaveBeenCalledTimes(2)
  } finally { dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
it('网络超时返回可操作的中文错误，镜像失败不会自动回退官方下载', async () => {
  let handler: any
  const fetcher: any = vi.fn(async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError') })
  const getManager = vi.fn()
  const ctx: any = { connection: { admit: () => ({ peer: {} }) }, webServer: { register: (route: any) => { handler = route.handler; return () => {} } } }
  const dispose = mountManagement(ctx, () => 0, fetcher, getManager)
  const server = createServer((req, res) => { void handler(req, res) }); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/dsh-speeker/manage?action=check&updateSource=mirror&mirrorUrl=https%3A%2F%2Fmirror.example`, { method: 'POST' })
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('更新连接超时')
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][0]).toMatch(/^https:\/\/mirror.example\//)
    expect(getManager).not.toHaveBeenCalled()
  } finally { dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
