import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { BASE, type Preferences } from '../shared.ts'
import { BailianTask, type VoiceEvent } from './bailian.ts'

export type TaskFactory = (preferences: Preferences, key: string, emit: (event: VoiceEvent) => void) => Pick<BailianTask, 'sendAudio' | 'finish' | 'cancel'>
type Entry = { task?: ReturnType<TaskFactory>; events: { seq: number; event: VoiceEvent }[]; seq: number; ended: boolean; touched: number; wake: Set<() => void> }
function reply(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value))
}

/** Ordered binary HTTP uploads and bounded long polls work without Desktop WS forwarding. */
export function mountHttpChannel(ctx: Context, preferences: () => Preferences, keyRef: CredentialRef, factory: TaskFactory = (p, k, emit) => new BailianTask(p, k, emit), updating = () => false) {
  const entries = new Map<string, Entry>()
  let creating = 0, disposed = false
  const active = () => creating + [...entries.values()].filter(e => !e.ended).length
  const remove = (id: string, entry: Entry) => {
    entry.ended = true; entry.task?.cancel(); for (const wake of entry.wake) wake(); entries.delete(id)
  }
  const sweep = setInterval(() => {
    for (const [id, entry] of entries) if (Date.now() - entry.touched > 30000) remove(id, entry)
  }, 5000)
  const unregister = ctx.webServer.register({ kind: 'exact', path: `${BASE}/channel`, handler: async (req, res) => {
    const admission = ctx.connection.admit(req)
    if ('rejection' in admission) { reply(res, admission.rejection, { error: 'Harness 登录或页面来源验证失败' }); return }
    const url = new URL(req.url ?? '/', 'http://localhost')
    const action = url.searchParams.get('action'), id = url.searchParams.get('id') ?? ''
    try {
      if (req.method === 'POST' && action === 'start') {
        if (updating()) { reply(res, 503, { error: '语音插件正在更新，请稍后重试' }); return }
        if (disposed || active() >= 4 || entries.size >= 64) { reply(res, 503, { error: '语音通道忙，请稍后重试' }); return }
        creating++
        try {
          const key = await ctx.credentials.resolve(keyRef)
          if (res.destroyed) return
          if (!key) { reply(res, 400, { error: '尚未配置百炼 API Key' }); return }
          if (disposed) { reply(res, 503, { error: '语音插件正在更新' }); return }
          const id = randomUUID(), entry: Entry = { events: [], seq: 0, ended: false, touched: Date.now(), wake: new Set() }
          entries.set(id, entry)
          res.once('close', () => { if (!res.writableFinished) remove(id, entry) })
          try {
            entry.task = factory(preferences(), key.value, event => {
              entry.events.push({ seq: ++entry.seq, event }); if (entry.events.length > 256) entry.events.shift()
              if (event.type === 'final' || event.type === 'error') entry.ended = true
              for (const wake of entry.wake) wake()
            })
          } catch { remove(id, entry); throw new Error('initialize') }
          reply(res, 200, { id }); return
        } finally { creating-- }
      }
      const entry = entries.get(id)
      if (!entry) { reply(res, 404, { error: '录音会话已结束，请重新开始' }); return }
      entry.touched = Date.now()
      if (req.method === 'GET' && action === 'events') {
        const after = Number(url.searchParams.get('after') ?? 0)
        if (!Number.isSafeInteger(after) || after < 0 || after > entry.seq) { reply(res, 400, { error: '事件序号无效' }); return }
        if (entry.seq === after && !entry.ended) await new Promise<void>(resolve => {
          const done = () => { clearTimeout(timer); entry.wake.delete(done); res.off('close', done); resolve() }
          const timer = setTimeout(done, 15000); entry.wake.add(done); res.once('close', done)
        })
        if (!res.destroyed) reply(res, 200, { events: entry.events.filter(e => e.seq > after), ended: entry.ended })
        return
      }
      if (req.method !== 'POST') { reply(res, 405, { error: '方法不支持' }); return }
      if (action === 'cancel') { remove(id, entry); reply(res, 200, { ok: true }); return }
      if (entry.ended) { reply(res, 409, { error: '录音已结束' }); return }
      if (action === 'audio') {
        if (req.headers['content-type'] !== 'application/octet-stream') { reply(res, 415, { error: '需要 PCM 二进制音频' }); return }
        const chunks: Buffer[] = []; let size = 0
        for await (const chunk of req) { size += chunk.length; if (size > 32000) { remove(id, entry); reply(res, 413, { error: '音频分块过大' }); return }; chunks.push(chunk) }
        entry.task?.sendAudio(Buffer.concat(chunks))
      } else if (action === 'finish') entry.task?.finish()
      else { reply(res, 400, { error: '操作无效' }); return }
      reply(res, 200, { ok: true })
    } catch { if (!res.headersSent) reply(res, 500, { error: 'Harness 无法初始化语音任务，请检查凭据存储和配置' }) }
  } })
  return { active, dispose: () => { disposed = true; clearInterval(sweep); unregister(); for (const [id, entry] of entries) remove(id, entry) } }
}
