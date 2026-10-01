import { createServer } from 'node:http'
import { once } from 'node:events'
import { expect, it, vi } from 'vitest'
import { latestRelease, mountManagement, compareVersions } from '../src/host/management.ts'

const remote: any = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('/tags?') ? [{ name: 'v0.4.0' }, { name: 'v0.2.1' }, { name: 'v0.5.0-beta' }] : { name: 'dsh-speeker', version: '0.4.0' } }))
it('检查正式版本，验证清单并固定仓库和发布标签', async () => {
  expect(await latestRelease(remote)).toEqual({ version: '0.4.0', spec: 'github:gone1724/dsh-listener#v0.4.0' })
  expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
  await expect(latestRelease(vi.fn(async () => ({ ok: false, status: 429 })) as any)).rejects.toThrow('HTTP 429')
})
it('更新/一键卸载只调用官方管理器操作本插件，并如实返回重启要求', async () => {
  let handler: any, active = 0, rejection: number | undefined
  const manager: any = { installBundle: vi.fn(async () => ({ application: 'restart-required' })), removeBundle: vi.fn(async () => ({ application: 'applied' })) }
  const ctx: any = { connection: { admit: () => rejection ? { rejection } : { peer: {} } }, webServer: { register: (route: any) => { handler = route.handler; return () => {} } } }
  const dispose = mountManagement(ctx, () => active, remote, async () => manager)
  const server = createServer((req, res) => { void handler(req, res) }); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const call = (action: string) => fetch(`${origin}/dsh-speeker/manage?action=${action}`, { method: 'POST' })
  try {
    expect((await (await call('check')).json()).available).toBe(true)
    expect((await (await call('update')).json()).application).toBe('restart-required')
    expect(manager.installBundle).toHaveBeenCalledExactlyOnceWith('github:gone1724/dsh-listener#v0.4.0')
    active = 1; expect((await call('uninstall')).status).toBe(409); expect(manager.removeBundle).not.toHaveBeenCalled()
    active = 0; expect((await call('uninstall')).status).toBe(200); expect(manager.removeBundle).toHaveBeenCalledExactlyOnceWith('dsh-speeker')
    rejection = 403; expect((await call('update')).status).toBe(403)
    expect(manager.installBundle).toHaveBeenCalledTimes(1)
  } finally { dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
