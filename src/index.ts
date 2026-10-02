import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-client-connection'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { BASE, defaults, validatePreferences, validateUpdateSource, type Preferences, type SettingsView } from './shared.ts'
import { BailianTask } from './host/bailian.ts'
import { mountHttpChannel } from './host/http-channel.ts'
import { mountManagement } from './host/management.ts'

export const name = 'dsh-listener'
export const inject = ['webServer', 'connection', 'credentials', 'settings']
export const Config = z.object({
  model: z.string().default(defaults.model).volatile(),
  region: z.union(['beijing', 'singapore']).default('beijing').volatile(),
  workspaceId: z.string().default('').volatile(),
  hotkey: z.string().default('AltRight').volatile(),
  mode: z.union(['hold', 'toggle']).default('hold').volatile(),
  autoSend: z.boolean().default(false).volatile(),
  updateSource: z.union(['official', 'mirror']).default('official').volatile(),
  mirrorUrl: z.string().default(defaults.mirrorUrl).volatile(),
})
const keyRef = credentialRef('DSH_LISTENER_API_KEY')
function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 8192) throw new Error('设置请求过大')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString())
}

/** Uses the same Host/Origin fence and browser authentication as Harness /api. */
export function apply(ctx: Context, initial: Preferences = defaults): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32000, perMessageDeflate: false })
  const tasks = new Map<WebSocket, BailianTask>()
  let disposed = false
  let writes = Promise.resolve()
  const descriptor = () => ctx.settings.describe().find(s => s.ns === name)
  const preferences = (): Preferences => validatePreferences(descriptor()?.value ?? initial)
  const view = async (): Promise<SettingsView> => ({ ...preferences(),
    configured: (await ctx.credentials.describe(keyRef)).configured,
    writable: ctx.settings.writable, revision: descriptor()?.revision ?? 0,
  })
  ctx.effect(() => ctx.settings.configure({ auto: false }))
  const channel = mountHttpChannel(ctx, preferences, keyRef)
  ctx.effect(() => channel.dispose)
  ctx.effect(() => mountManagement(ctx, () => channel.active() + tasks.size))

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${BASE}/config`, handler: async (req, res) => {
    const admission = ctx.connection.admit(req)
    if ('rejection' in admission) { json(res, admission.rejection, { error: '请先登录 Harness' }); return }
    try {
      if (req.method === 'GET') { json(res, 200, await view()); return }
      if (req.method !== 'POST') { json(res, 405, { error: '方法不支持' }); return }
      if (!req.headers['content-type']?.startsWith('application/json')) { json(res, 415, { error: '需要 JSON 请求' }); return }
      const request = await body(req)
      const reset = request?.reset === true
      if (request.reset !== undefined && typeof request.reset !== 'boolean') throw new Error('清除操作无效')
      const downloadOnly = request?.updateDownload !== undefined
      const source = downloadOnly ? validateUpdateSource(request.updateDownload, false) : undefined
      const next = reset ? defaults : downloadOnly ? undefined : validatePreferences(request?.preferences)
      if (reset && (downloadOnly || request.apiKey !== undefined || request.clearKey !== undefined)) throw new Error('清除不能与保存同时进行')
      if (downloadOnly && (request.apiKey !== undefined || request.clearKey !== undefined)) throw new Error('下载设置不能修改密钥')
      if (!Number.isInteger(request?.revision) || request.revision < 0) throw new Error('设置版本无效，请刷新后重试')
      if (request.apiKey !== undefined && (typeof request.apiKey !== 'string' || request.apiKey.length > 2048 || !request.apiKey.trim())) throw new Error('API Key 无效')
      if (request.clearKey !== undefined && typeof request.clearKey !== 'boolean') throw new Error('密钥操作无效')
      if (request.apiKey !== undefined && request.clearKey) throw new Error('不能同时保存和清除密钥')
      const write = writes.then(async () => {
        if (!ctx.settings.writable) throw new Error('当前配置只读')
        if (request.revision !== descriptor()?.revision) throw new Error('设置已变化，请刷新后重试')
        if (reset && (channel.active() + tasks.size > 0)) throw new Error('请先结束录音')
        // Credentials are stored by Harness, never in the plugin profile or response.
        if (request.apiKey !== undefined) await ctx.credentials.set(keyRef, request.apiKey.trim())
        if (reset || request.clearKey === true) await ctx.credentials.unset(keyRef)
        await ctx.settings.update(name, downloadOnly ? validatePreferences({ ...preferences(), ...source }) : next!, request.revision)
      })
      writes = write.catch(() => undefined)
      await write
      json(res, 200, await view())
    } catch { json(res, 400, { error: '保存或读取失败：检查配置、可写权限，或刷新后重试。密钥与普通设置分别保存。' }) }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${BASE}/pcm-worklet.js`, handler: async (req, res) => {
    const admission = ctx.connection.admit(req)
    if ('rejection' in admission) { res.writeHead(admission.rejection); res.end(); return }
    try {
      const source = await readFile(new URL('./pcm-worklet.js', import.meta.url), 'utf8')
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(source)
    } catch { res.writeHead(500); res.end('Audio worklet unavailable') }
  } }))
  ctx.effect(() => ctx.webServer.registerUpgrade({ path: `${BASE}/stream`, handler: async (req, socket, head) => {
    const admission = ctx.connection.admit(req)
    if ('rejection' in admission) { socket.end(`HTTP/1.1 ${admission.rejection} Rejected\r\nConnection: close\r\n\r\n`); return }
    if (disposed || wss.clients.size >= 4) { socket.end('HTTP/1.1 503 Busy\r\nConnection: close\r\n\r\n'); return }
    wss.handleUpgrade(req, socket, head, client => {
      const send = (event: unknown) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(event)) }
      const initialize = async () => {
      let key: Awaited<ReturnType<typeof ctx.credentials.resolve>>
      try { key = await ctx.credentials.resolve(keyRef) }
      catch { send({ type: 'error', message: 'Harness 无法读取已保存的百炼密钥，请在语音输入设置中重新保存' }); client.close(); return }
      if (disposed || client.readyState !== WebSocket.OPEN) return
      if (!key) { send({ type: 'error', message: '尚未配置百炼 API Key，请打开语音输入设置' }); client.close(); return }
      const p = preferences()
      const task = new BailianTask(p, key.value, event => {
        send(event)
        if (event.type === 'error' || event.type === 'final') { tasks.delete(client); client.close() }
      })
      tasks.set(client, task)
      client.on('message', (data, binary) => {
        if (binary) { task.sendAudio(Buffer.from(data as Buffer)); return }
        try {
          const event = JSON.parse(data.toString())
          if (event.type === 'finish') task.finish()
          else if (event.type === 'cancel') { task.cancel(); client.close() }
          else { task.cancel(); client.close(1008, 'Unknown command') }
        } catch { task.cancel(); client.close(1008, 'Invalid command') }
      })
      client.on('close', () => { task.cancel(); tasks.delete(client) })
      client.on('error', () => { task.cancel(); tasks.delete(client) })
      }
      void initialize().catch(() => { send({ type: 'error', message: '语音任务初始化失败，请检查配置并重启 Harness' }); client.close() })
    })
  } }))
  ctx.effect(() => () => {
    disposed = true
    for (const task of tasks.values()) task.cancel()
    tasks.clear()
    for (const client of wss.clients) client.terminate()
    wss.close()
  })
}
