import { createServer } from 'node:http'
import { once } from 'node:events'
import { expect, it, vi } from 'vitest'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { mountHttpChannel } from '../src/host/http-channel.ts'
import { mountManagement } from '../src/host/management.ts'
import { defaults } from '../src/shared.ts'

it('更新下载期间拒绝新录音，失败后释放维护状态', async () => {
  const routes = new Map<string, any>()
  let updating = false
  const ctx: any = { get: () => ({ dir: 'F:/test/profile' }), credentials: { resolve: async () => ({ value: 'test' }) }, connection: { admit: () => ({ peer: {} }) }, webServer: { register: (route: any) => { routes.set(route.path, route.handler); return () => routes.delete(route.path) } } }
  const channel = mountHttpChannel(ctx, () => defaults, credentialRef('DSH_LISTENER_API_KEY'), () => ({ sendAudio: vi.fn(), finish: vi.fn(), cancel: vi.fn() }), () => updating)
  const downloading = Promise.withResolvers<void>(), downloaded = Promise.withResolvers<void>()
  const manager = { installBundle: vi.fn(async () => ({ application: 'failed', error: { code: 'operation-error' } })) }
  const metadata: any = async () => ({ ok: true, json: async () => ({ name: 'dsh-listener', version: '0.5.0', dist: { tarball: 'https://registry.npmjs.org/dsh-listener/-/dsh-listener-0.5.0.tgz', integrity: 'sha512-' + Buffer.alloc(64).toString('base64') } }) })
  const download: any = async () => { downloading.resolve(); await downloaded.promise; return { path: 'F:/test/package.tgz', dispose: async () => {} } }
  const dispose = mountManagement(ctx, channel.active, metadata, async () => manager as any, download, value => { updating = value })
  const server = createServer((req, res) => { void routes.get(new URL(req.url!, 'http://localhost').pathname)(req, res) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/dsh-listener`
  try {
    const installation = fetch(base + '/manage?action=update', { method: 'POST' })
    await downloading.promise
    expect((await fetch(base + '/channel?action=start', { method: 'POST' })).status).toBe(503)
    expect(channel.active()).toBe(0)
    downloaded.resolve()
    expect((await installation).status).toBe(400)
    expect(manager.installBundle).toHaveBeenCalledOnce()
    expect(updating).toBe(false)
    expect((await fetch(base + '/channel?action=start', { method: 'POST' })).status).toBe(200)
  } finally { downloaded.resolve(); channel.dispose(); dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
