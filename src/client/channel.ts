import { BASE, MAX_BUFFER_BYTES } from '../shared.ts'

/** Socket-shaped HTTP transport; uploads are serialized so finish never overtakes PCM. */
export class HttpVoiceChannel {
  static OPEN = 1
  readyState = 1
  bufferedAmount = 0
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  private id = ''
  private abort = new AbortController()
  private startup: Promise<void>
  private uploads: Promise<void>
  constructor(_url?: URL) {
    this.startup = this.start()
    this.uploads = this.startup
    void this.startup.catch(error => this.fail(error))
  }
  private async request(action: string, options: RequestInit = {}, timeout = 15000) {
    const query = new URLSearchParams({ action, ...(this.id ? { id: this.id } : {}) })
    const response = await fetch(`${BASE}/channel?${query}`, { credentials: 'same-origin', ...options,
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(timeout)]) })
    const result = await response.json()
    if (!response.ok) throw new Error(`Harness 语音接口 HTTP ${response.status}：${result.error ?? '请求失败'}`)
    return result
  }
  private async start() {
    const result = await this.request('start', { method: 'POST' })
    if (typeof result.id !== 'string') throw new Error('录音会话响应无效')
    this.id = result.id
    if (this.readyState !== 1) { this.cancelRemote(); return }
    void this.poll().catch(error => this.fail(error))
  }
  private async poll() {
    let after = 0
    while (this.readyState === 1) {
      const query = new URLSearchParams({ action: 'events', id: this.id, after: String(after) })
      const response = await fetch(`${BASE}/channel?${query}`, { credentials: 'same-origin', signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(20000)]) })
      const result = await response.json()
      if (!response.ok) throw new Error(`Harness 事件接口 HTTP ${response.status}：${result.error ?? '请求失败'}`)
      if (this.readyState !== 1) return
      if (!Array.isArray(result.events)) throw new Error('语音事件响应无效')
      for (const item of result.events) {
        if (!Number.isSafeInteger(item.seq) || item.seq <= after) throw new Error('语音事件顺序无效')
        after = item.seq; this.onmessage?.({ data: JSON.stringify(item.event) })
        if (this.readyState !== 1) return
      }
      if (result.ended) { this.readyState = 3; this.onclose?.(); return }
    }
  }
  send(data: ArrayBuffer | string) {
    if (this.readyState !== 1) return
    if (typeof data === 'string' && JSON.parse(data).type === 'cancel') { this.close(); return }
    const bytes = typeof data === 'string' ? 0 : data.byteLength
    this.bufferedAmount += bytes
    if (this.bufferedAmount > MAX_BUFFER_BYTES) { this.fail(new Error('音频上传网络过慢，已取消')); return }
    this.uploads = this.uploads.then(async () => {
      if (this.readyState !== 1) return
      if (typeof data === 'string') await this.request('finish', { method: 'POST' })
      else await this.request('audio', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: data })
    }).catch(error => this.fail(error)).finally(() => { this.bufferedAmount -= bytes })
  }
  private fail(error: unknown) {
    if (this.readyState !== 1) return
    this.onmessage?.({ data: JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Harness HTTP 语音连接失败' }) })
    this.close()
  }
  private cancelRemote() {
    if (!this.id) return
    void fetch(`${BASE}/channel?action=cancel&id=${encodeURIComponent(this.id)}`, { method: 'POST', credentials: 'same-origin', keepalive: true, signal: AbortSignal.timeout(3000) }).catch(() => undefined)
  }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.abort.abort(); this.cancelRemote() }
}
