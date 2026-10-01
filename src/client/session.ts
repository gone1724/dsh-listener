import { BASE, MAX_AUDIO_BYTES, MAX_BUFFER_BYTES } from '../shared.ts'
import { Recording } from './audio.ts'

export interface SessionState { phase: 'idle' | 'requesting' | 'recording' | 'finishing' | 'error'; preview: string; message: string }
/** Serial microphone owner: asynchronous grants, worklet tail and cloud task are one lifetime. */
export class VoiceSession {
  private state: SessionState = { phase: 'idle', preview: '', message: '' }
  private listeners = new Set<() => void>()
  private generation = 0
  private capture?: Recording
  private socket?: WebSocket
  private ready = false
  private queue: ArrayBuffer[] = []
  private queuedBytes = 0
  private totalBytes = 0
  private finishing = false
  private finishSent = false
  private timer?: ReturnType<typeof setTimeout>
  private limit?: ReturnType<typeof setTimeout>
  constructor(private final: (text: string) => void) {}
  getSnapshot = (): SessionState => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  active = (): boolean => ['requesting', 'recording'].includes(this.state.phase)
  busy = (): boolean => this.active() || this.state.phase === 'finishing'
  private set(patch: Partial<SessionState>): void { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener() }
  async start(): Promise<void> {
    if (this.busy()) return
    const run = ++this.generation
    this.ready = false; this.finishing = false; this.finishSent = false
    this.queue = []; this.queuedBytes = 0; this.totalBytes = 0
    this.set({ phase: 'requesting', preview: '', message: '正在请求麦克风…' })
    const fail = (message: string) => { if (this.generation === run) this.fail(message) }
    const capture = new Recording(chunk => { if (this.generation === run) this.audio(chunk) }, () => fail('麦克风中断，录音已取消'))
    this.capture = capture
    try {
      const url = new URL(`${BASE}/stream`, window.location.href)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(url)
      this.socket = socket
      this.timer = setTimeout(() => fail('连接或麦克风授权超时，已取消'), 15000)
      socket.onmessage = event => {
        if (this.generation !== run) return
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'ready') {
            this.ready = true
            for (const chunk of this.queue) socket.send(chunk)
            this.queue = []; this.queuedBytes = 0
            this.flushFinish()
          } else if (message.type === 'partial') {
            if (typeof message.text !== 'string') throw new Error('Invalid transcript')
            this.set({ preview: message.text })
          } else if (message.type === 'final') {
            if (!this.finishSent || typeof message.text !== 'string') throw new Error('Unexpected final')
            const text = message.text
            this.cancel()
            this.final(text)
          } else if (message.type === 'error') fail(typeof message.message === 'string' ? message.message : '识别失败')
          else throw new Error('Unknown voice event')
        } catch { fail('语音服务响应无效') }
      }
      let diagnosing = false
      socket.onerror = () => {
        diagnosing = true
        // Browser WebSocket errors conceal the handshake status. Compare the same-origin
        // authenticated HTTP route without sending audio or revealing the API Key.
        void fetch(`${BASE}/config`, { credentials: 'same-origin', signal: AbortSignal.timeout(3000) }).then(response => {
          if (response.status === 401) fail('Harness 登录已失效（HTTP 401），请关闭并重新打开 Desktop 页面。')
          else if (response.status === 403) fail('Harness 拒绝当前页面来源（HTTP 403），请从 Desktop 自带页面打开。')
          else if (response.ok) fail('语音设置接口正常，但 Harness 本地 WebSocket 握手失败。请更新插件并完全重启 Desktop；若仍失败，请检查 Desktop 对 /dsh-speeker/stream 的 WebSocket 转发。尚未连接百炼。')
          else fail(`Harness 语音接口不可用（HTTP ${response.status}），请检查插件是否启用并重启 Desktop。`)
        }).catch(() => fail('无法访问 Harness 本地语音接口，请检查 Desktop 内核是否运行，并重启 Desktop。'))
      }
      socket.onclose = () => { if (!diagnosing) fail('连接中断，录音已取消') }
      await capture.start()
      if (this.generation !== run) { await capture.cancel(); return }
      this.set({ phase: 'recording', message: '' })
      clearTimeout(this.timer)
      this.timer = setTimeout(() => { if (!this.ready) fail('百炼连接超时') }, 15000)
      this.limit = setTimeout(() => { void this.finish() }, 120000)
    } catch (error) { fail(error instanceof Error ? error.message : '无法开启麦克风') }
  }
  async finish(): Promise<void> {
    if (this.state.phase === 'requesting') { this.cancel('麦克风尚未就绪，本次录音已取消'); return }
    if (this.state.phase !== 'recording') return
    const run = this.generation
    this.set({ phase: 'finishing', message: '正在识别…' })
    clearTimeout(this.limit)
    try {
      await this.capture?.stop()
      if (this.generation !== run) return
      this.finishing = true
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.fail('等待识别结果超时'), 20000)
      if (!this.totalBytes) { this.fail('没有采集到音频'); return }
      this.flushFinish()
    } catch (error) { if (this.generation === run) this.fail(error instanceof Error ? error.message : '停止录音失败') }
  }
  cancel(message = ''): void {
    ++this.generation
    clearTimeout(this.timer); clearTimeout(this.limit)
    void this.capture?.cancel()
    this.capture = undefined
    const socket = this.socket
    this.socket = undefined
    if (socket) {
      socket.onmessage = null; socket.onclose = null; socket.onerror = null
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'cancel' }))
      socket.close()
    }
    this.queue = []; this.queuedBytes = 0
    this.set({ phase: 'idle', preview: '', message })
  }
  private fail(message: string): void { this.cancel(); this.set({ phase: 'error', message }) }
  private audio(chunk: ArrayBuffer): void {
    const remaining = MAX_AUDIO_BYTES - this.totalBytes
    if (remaining <= 0) { if (this.state.phase === 'recording') void this.finish(); return }
    if (chunk.byteLength > remaining) chunk = chunk.slice(0, remaining)
    this.totalBytes += chunk.byteLength
    if (this.ready && this.socket?.readyState === WebSocket.OPEN) {
      if (this.socket.bufferedAmount > MAX_BUFFER_BYTES) { this.fail('上传网络过慢，已取消'); return }
      this.socket.send(chunk)
    } else {
      this.queuedBytes += chunk.byteLength
      if (this.queuedBytes > MAX_BUFFER_BYTES) { this.fail('百炼连接过慢，已取消'); return }
      this.queue.push(chunk)
    }
    if (this.totalBytes === MAX_AUDIO_BYTES && this.state.phase === 'recording') void this.finish()
  }
  private flushFinish(): void {
    if (this.finishing && this.ready && !this.finishSent && this.socket?.readyState === WebSocket.OPEN) {
      this.finishSent = true
      this.socket.send(JSON.stringify({ type: 'finish' }))
    }
  }
}
