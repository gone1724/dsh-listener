import { createServer } from 'node:http'
import { once } from 'node:events'
import { expect, it, vi } from 'vitest'
import { latestRelease, mountManagement, compareVersions } from '../src/host/management.ts'
import { defaults, validatePreferences, validateUpdateSource } from '../src/shared.ts'

const integrity = 'sha512-' + Buffer.alloc(64).toString('base64')
const manifest = { name: 'dsh-listener', version: '0.4.0', dist: { tarball: 'https://registry.npmjs.org/dsh-listener/-/dsh-listener-0.4.0.tgz', integrity } }
const remote: any = vi.fn(async () => ({ ok: true, json: async () => manifest }))
it('检查 npm latest，固定包名并验证版本、下载地址和完整性字段', async () => {
  expect(await latestRelease(remote)).toEqual({ version: '0.4.0', tarball: manifest.dist.tarball, integrity })
  expect(remote.mock.calls[0][0]).toBe('https://registry.npmjs.org/dsh-listener/latest')
  expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
  await expect(latestRelease(vi.fn(async () => ({ ok: false, status: 429 })) as any)).rejects.toThrow('HTTP 429')
  for (const invalid of [null, { ...manifest, name: 'another-package' }, { ...manifest, version: '0.4.0-beta' }, { ...manifest, dist: { ...manifest.dist, tarball: 'https://evil.example/package.tgz' } }, { ...manifest, dist: { ...manifest.dist, integrity: '' } }]) {
    await expect(latestRelease(vi.fn(async () => ({ ok: true, json: async () => invalid })) as any)).rejects.toThrow()
  }
})
it('npm 镜像按 registry 路径查询和下载，迁移旧 GitHub 代理配置', async () => {
  const fetcher: any = vi.fn(async () => ({ ok: true, json: async () => manifest }))
  const source = { updateSource: 'mirror' as const, mirrorUrl: 'https://mirror.example/proxy/' }
  expect(await latestRelease(fetcher, source)).toEqual({ version: '0.4.0', tarball: 'https://mirror.example/proxy/dsh-listener/-/dsh-listener-0.4.0.tgz', integrity })
  expect(fetcher.mock.calls[0][0]).toBe('https://mirror.example/proxy/dsh-listener/latest')
  expect(validateUpdateSource({ updateSource: 'mirror', mirrorUrl: 'https://gh-proxy.org/' })).toEqual({ updateSource: 'mirror', mirrorUrl: defaults.mirrorUrl })
  const mirrored = { ...manifest, dist: { ...manifest.dist, tarball: 'https://mirror.example/proxy/dsh-listener/-/dsh-listener-0.4.0.tgz' } }
  expect((await latestRelease(vi.fn(async () => ({ ok: true, json: async () => mirrored })) as any, source)).version).toBe('0.4.0')
})
it('旧设置默认官方下载，镜像前缀验证拒绝无效或带凭据的网址', () => {
  const { updateSource, mirrorUrl, ...old } = defaults
  expect(validatePreferences(old)).toEqual(defaults)
  expect(validateUpdateSource({ updateSource: 'official' })).toEqual({ updateSource: 'official', mirrorUrl: '' })
  for (const value of ['', 'http://mirror.example', 'file:///tmp', 'https://user:password@mirror.example', 'https://mirror.example?url=', 'https://mirror.example/#fragment']) {
    expect(() => validateUpdateSource({ updateSource: 'mirror', mirrorUrl: value })).toThrow()
  }
})
it('更新固定插件并返回重启要求，拒绝已移除的卸载操作', async () => {
  let handler: any, active = 0, rejection: number | undefined
  const manager: any = { installBundle: vi.fn(async () => ({ application: 'restart-required' })), removeBundle: vi.fn(async () => ({ application: 'applied' })) }
  const download = vi.fn(async (_url: string, _version: string, progress: any, _fetcher?: typeof fetch, _integrity?: string) => {
    progress({ phase: 'downloading', received: 100, total: 100 })
    return { path: 'F:/test/dsh-listener-test.tgz', dispose: vi.fn(async () => {}) }
  })
  const ctx: any = { connection: { admit: () => rejection ? { rejection } : { peer: {} } }, webServer: { register: (route: any) => { handler = route.handler; return () => {} } } }
  const dispose = mountManagement(ctx, () => active, remote, async () => manager, download)
  const server = createServer((req, res) => { void handler(req, res) }); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const call = (action: string, source: Record<string, string> = {}) => fetch(`${origin}/dsh-listener/manage?${new URLSearchParams({ action, ...source })}`, { method: 'POST' })
  try {
    expect((await (await call('check')).json()).available).toBe(true)
    expect((await (await call('update')).json()).application).toBe('restart-required')
    expect(download.mock.calls[0][4]).toBe(integrity)
    expect(manager.installBundle).toHaveBeenCalledExactlyOnceWith('F:/test/dsh-listener-test.tgz')
    expect(download.mock.calls[0][0]).toBe('https://registry.npmjs.org/dsh-listener/-/dsh-listener-0.4.0.tgz')
    expect((await call('update', { updateSource: 'mirror', mirrorUrl: 'https://mirror.example' })).status).toBe(200)
    expect(download.mock.calls[1][0]).toBe('https://mirror.example/dsh-listener/-/dsh-listener-0.4.0.tgz')
    expect((await (await fetch(`${origin}/dsh-listener/manage?action=progress`)).json())).toEqual({ phase: 'done', received: 100, total: 100 })
    expect((await call('update', { updateSource: 'mirror', mirrorUrl: '' })).status).toBe(400)
    active = 1; expect((await call('update')).status).toBe(409)
    expect((await call('uninstall')).status).toBe(400)
    active = 0; expect((await call('uninstall')).status).toBe(400)
    expect(manager.removeBundle).not.toHaveBeenCalled()
    rejection = 403; expect((await call('update')).status).toBe(403)
    expect((await fetch(`${origin}/dsh-listener/manage?action=progress`)).status).toBe(403)
    expect(manager.installBundle).toHaveBeenCalledTimes(2)
    rejection = undefined
    manager.installBundle.mockResolvedValueOnce({ application: 'failed', error: { code: 'bundle-in-use' } })
    const occupied = await call('update')
    expect(occupied.status).toBe(400)
    expect((await occupied.json()).error).toContain('旧版插件仍被宿主加载')
    expect((await (await fetch(`${origin}/dsh-listener/manage?action=progress`)).json()).phase).toBe('error')
    manager.installBundle.mockRejectedValueOnce({ code: 'bundle-in-use' })
    expect((await (await call('update')).json()).error).toContain('从 Desktop 插件管理')
    // A rejected install must release the management lock for a later retry.
    expect((await call('update')).status).toBe(200)
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
    const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/dsh-listener/manage?action=check&updateSource=mirror&mirrorUrl=https%3A%2F%2Fmirror.example`, { method: 'POST' })
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('更新连接超时')
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][0]).toMatch(/^https:\/\/mirror.example\//)
    expect(getManager).not.toHaveBeenCalled()
  } finally { dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
