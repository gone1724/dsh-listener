import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket from 'ws'
import { expect, it } from 'vitest'
import { apply } from '../src/index.ts'
import { defaults } from '../src/shared.ts'

it.each(['missing', 'unreadable'])('本地通道能返回 %s 密钥的明确错误，而不是拒绝 WebSocket 握手', async (mode) => {
  const effects: (() => void)[] = []
  let upgrade: any
  const server = createServer()
  const ctx: any = {
    effect(fn: () => (() => void)) { effects.push(fn()) },
    settings: { configure: () => () => {}, describe: () => [{ ns: 'dsh-speeker', value: defaults, revision: 0 }], writable: true },
    credentials: { resolve: async () => { if (mode === 'unreadable') throw new Error('private storage detail'); return undefined } },
    connection: { admit: () => ({ peer: {} }) },
    webServer: { register: () => () => {}, registerUpgrade: (route: any) => { upgrade = route.handler; return () => {} } },
  }
  apply(ctx)
  server.on('upgrade', (req, socket, head) => { void upgrade(req, socket, head) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const port = (server.address() as { port: number }).port
  const client = new WebSocket(`ws://127.0.0.1:${port}/dsh-speeker/stream`)
  try {
    const [raw] = await once(client, 'message')
    const event = JSON.parse(raw.toString())
    expect(event.type).toBe('error')
    expect(event.message).toContain(mode === 'missing' ? 'API Key' : '重新保存')
    expect(event.message).not.toContain('private storage detail')
  } finally {
    client.terminate()
    for (const dispose of effects.reverse()) dispose()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
