import { createServer } from 'node:http'
import { once } from 'node:events'
import { expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'
import { defaults } from '../src/shared.ts'

it('下载设置独立保存；清除配置恢复默认并移除密钥，拒绝过期或混合请求', async () => {
  const effects: (() => void)[] = [], routes = new Map<string, any>()
  let value = { ...defaults, model: 'keep-model', autoSend: true }, revision = 0
  let configured = true
  const credentials = { describe: async () => ({ configured }), set: vi.fn(), unset: vi.fn(async () => { configured = false }) }
  const ctx: any = {
    effect(fn: any) { effects.push(fn()) }, credentials,
    settings: { configure: () => () => {}, writable: true,
      describe: () => [{ ns: 'dsh-listener', value, revision }],
      update: async (_name: string, next: any) => { value = next; revision++ },
    }, connection: { admit: () => ({ peer: {} }) },
    webServer: { register: (route: any) => { routes.set(route.path, route.handler); return () => {} } },
  }
  apply(ctx)
  const server = createServer((req, res) => { void routes.get('/dsh-listener/config')(req, res) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/dsh-listener/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updateDownload: { updateSource: 'mirror', mirrorUrl: '' }, revision: 0 }),
    })
    expect(response.status).toBe(200)
    expect(value).toEqual({ ...defaults, model: 'keep-model', autoSend: true, updateSource: 'mirror', mirrorUrl: '' })
    expect(credentials.set).not.toHaveBeenCalled(); expect(credentials.unset).not.toHaveBeenCalled()
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/dsh-listener/config`
    const reset = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true, revision: 1 }) })
    expect(reset.status).toBe(200); expect(value).toEqual(defaults)
    expect((await reset.json()).configured).toBe(false); expect(credentials.unset).toHaveBeenCalledOnce()
    for (const body of [{ reset: true, revision: 1 }, { reset: true, revision: 2, apiKey: 'not-a-real-key' }]) {
      expect((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status).toBe(400)
    }
    expect(credentials.unset).toHaveBeenCalledOnce(); expect(credentials.set).not.toHaveBeenCalled()
  } finally {
    for (const dispose of effects.reverse()) dispose()
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

it.each(['missing', 'unreadable'])('HTTP 通道拒绝 %s 密钥，不泄露凭据存储细节', async (mode) => {
  const effects: (() => void)[] = []
  const routes = new Map<string, any>()
  const resolve = vi.fn(async () => { if (mode === 'unreadable') throw new Error('private storage detail'); return undefined })
  const ctx: any = {
    effect(fn: () => (() => void)) { effects.push(fn()) },
    settings: { configure: () => () => {}, describe: () => [{ ns: 'dsh-listener', value: defaults, revision: 0 }], writable: true },
    credentials: { resolve },
    connection: { admit: () => ({ peer: {} }) },
    webServer: { register: (route: any) => { routes.set(route.path, route.handler); return () => {} } },
  }
  apply(ctx)
  const server = createServer((req, res) => { void routes.get('/dsh-listener/channel')(req, res) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const port = (server.address() as { port: number }).port
  try {
    const response = await fetch(`http://127.0.0.1:${port}/dsh-listener/channel?action=start`, { method: 'POST' })
    expect(response.status).toBe(mode === 'missing' ? 400 : 500)
    const event = await response.json()
    expect(event.error).toContain(mode === 'missing' ? 'API Key' : '凭据存储')
    expect(event.error).not.toContain('private storage detail')
    expect(resolve).toHaveBeenCalledOnce()
  } finally {
    for (const dispose of effects.reverse()) dispose()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
