import { createServer } from 'node:http'
import { once } from 'node:events'
import { expect, it, vi } from 'vitest'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { mountHttpChannel, type TaskFactory } from '../src/host/http-channel.ts'
import { HttpVoiceChannel } from '../src/client/channel.ts'
import { defaults } from '../src/shared.ts'

it('禁用本地 WebSocket 的真实 HTTP 服务仍可流式上传、按顺序结束并返回最终文本', async () => {
  const sequence: string[] = [], buffers: Buffer[] = []
  let handler: any
  const factory: TaskFactory = (_p, _key, emit) => {
    setTimeout(() => emit({ type: 'ready' }), 0)
    return { sendAudio: b => { sequence.push('audio'); buffers.push(b) }, finish: () => { sequence.push('finish'); emit({ type: 'final', text: '流式识别成功' }) }, cancel: () => sequence.push('cancel') }
  }
  const ctx: any = { credentials: { resolve: async () => ({ value: 'test-placeholder' }) }, connection: { admit: () => ({ peer: {} }) }, webServer: { register: (route: any) => { handler = route.handler; return () => {} } } }
  const channel = mountHttpChannel(ctx, () => defaults, credentialRef('DSH_LISTENER_API_KEY'), factory)
  const server = createServer((req, res) => { void handler(req, res) })
  server.on('upgrade', (_req, socket) => socket.destroy())
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`, nativeFetch = globalThis.fetch
  vi.stubGlobal('fetch', (url: string, options: RequestInit) => nativeFetch(new URL(url, origin), options))
  const client = new HttpVoiceChannel()
  try {
    const final = await new Promise<string>((resolve, reject) => {
      client.onmessage = ({ data }) => {
        const e = JSON.parse(data)
        if (e.type === 'error') reject(new Error(e.message))
        if (e.type === 'ready') { client.send(new Uint8Array([1, 2]).buffer); client.send(new Uint8Array([3, 4]).buffer); client.send(JSON.stringify({ type: 'finish' })) }
        if (e.type === 'final') resolve(e.text)
      }
    })
    expect(final).toBe('流式识别成功')
    expect(sequence.slice(0, 3)).toEqual(['audio', 'audio', 'finish'])
    expect([...Buffer.concat(buffers)]).toEqual([1, 2, 3, 4])
    client.close()
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(channel.active()).toBe(0)
  } finally { client.close(); channel.dispose(); vi.unstubAllGlobals(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})

it.each([401, 403])('HTTP %s 会阻止创建任务，错误不被吞成泛化握手失败', async status => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ error: 'Harness 验证失败' }) })
  vi.stubGlobal('fetch', fetcher)
  const client = new HttpVoiceChannel()
  try {
    const message = await new Promise<string>(resolve => { client.onmessage = e => resolve(JSON.parse(e.data).message) })
    expect(message).toContain(`HTTP ${status}`)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/dsh-listener/channel?action=start', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }))
  } finally { client.close(); vi.unstubAllGlobals() }
})
