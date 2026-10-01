import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { joinText, MAX_AUDIO_BYTES, MAX_BUFFER_BYTES, SAMPLE_RATE, upstreamUrl, type Preferences } from '../shared.ts'

export type VoiceEvent = { type: 'ready' } | { type: 'partial'; text: string } | { type: 'final'; text: string } | { type: 'error'; message: string }
export interface SocketLike {
  readyState: number
  bufferedAmount: number
  send(data: string | Buffer): void
  close(): void
  terminate(): void
  on(event: string, listener: (...args: any[]) => void): unknown
}
export type SocketFactory = (url: string, key: string) => SocketLike
const connect: SocketFactory = (url, key) => new WebSocket(url, { headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 10000, maxPayload: 1024 * 1024 })

/** One task per recording. Nothing writes to a Harness session on the Host. */
export class BailianTask {
  readonly taskId = randomUUID().replaceAll('-', '')
  private socket: SocketLike
  private ready = false
  private finishing = false
  private finishSent = false
  private ended = false
  private bytes = 0
  private queuedBytes = 0
  private queue: Buffer[] = []
  private sentences = new Map<number, string>()
  private timer: ReturnType<typeof setTimeout>
  private deadline: ReturnType<typeof setTimeout>

  constructor(p: Preferences, key: string, private emit: (event: VoiceEvent) => void, factory: SocketFactory = connect) {
    this.socket = factory(upstreamUrl(p), key)
    this.timer = setTimeout(() => this.fail('百炼连接超时，请检查网络和配置'), 15000)
    this.deadline = setTimeout(() => this.fail('录音超过 120 秒，已取消'), 125000)
    this.socket.on('open', () => {
      if (this.ended) return
      this.socket.send(JSON.stringify({ header: { action: 'run-task', task_id: this.taskId, streaming: 'duplex' },
        payload: { task_group: 'audio', task: 'asr', function: 'recognition', model: p.model,
          parameters: { format: 'pcm', sample_rate: SAMPLE_RATE }, input: {} } }))
    })
    this.socket.on('message', (raw: Buffer | string) => this.message(raw))
    this.socket.on('error', (error: { code?: string }) => {
      const code = String(error?.code ?? '').replace(/[^A-Z0-9_]/g, '').slice(0, 40)
      this.fail(`百炼连接失败${code ? `（${code}）` : ''}，请检查网络、地域和 Workspace ID`)
    })
    this.socket.on('unexpected-response', (_req: unknown, response: { statusCode: number }) => {
      this.fail(`百炼连接失败（HTTP ${response.statusCode}）。${response.statusCode === 401 || response.statusCode === 403 ? '请检查密钥有效性、地域、Workspace ID 和模型权限。' : '请检查 Workspace ID、服务地址和网络。'}`)
    })
    this.socket.on('close', () => { if (!this.ended) this.fail('百炼连接提前关闭，识别未完成') })
  }

  sendAudio(audio: Buffer): void {
    if (this.ended) return
    if (this.finishing) { this.fail('停止后收到音频，录音协议无效'); return }
    if (!audio.length || audio.length % 2 || audio.length > 32000) { this.fail('PCM 音频分块无效'); return }
    this.bytes += audio.length
    if (this.bytes > MAX_AUDIO_BYTES) { this.fail('录音超过 120 秒，已取消'); return }
    if (!this.ready) {
      this.queuedBytes += audio.length
      if (this.queuedBytes > MAX_BUFFER_BYTES) { this.fail('百炼连接过慢，已取消录音'); return }
      this.queue.push(Buffer.from(audio))
    } else if (this.socket.bufferedAmount > MAX_BUFFER_BYTES) this.fail('上传网络过慢，已取消录音')
    else this.socket.send(audio)
  }

  finish(): void {
    if (this.ended || this.finishing) return
    if (!this.bytes) { this.fail('没有采集到音频'); return }
    this.finishing = true
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.fail('等待最终识别结果超时'), 20000)
    this.flushFinish()
  }

  cancel(): void {
    if (this.ended) return
    this.ended = true
    clearTimeout(this.timer); clearTimeout(this.deadline)
    this.queue = []; this.sentences.clear()
    this.socket.terminate()
  }
  private fail(message: string): void {
    if (this.ended) return
    this.cancel()
    this.emit({ type: 'error', message })
  }
  private flushFinish(): void {
    if (!this.ready || !this.finishing || this.finishSent || this.ended) return
    this.finishSent = true
    this.socket.send(JSON.stringify({ header: { action: 'finish-task', task_id: this.taskId, streaming: 'duplex' }, payload: { input: {} } }))
  }
  private message(raw: Buffer | string): void {
    if (this.ended) return
    let e: any
    try { e = JSON.parse(raw.toString()) } catch { this.fail('百炼返回了无效数据'); return }
    if (e?.header?.task_id !== this.taskId) return
    switch (e.header.event) {
      case 'task-started': {
        if (this.ready) return
        this.ready = true
        if (!this.finishing) clearTimeout(this.timer)
        for (const chunk of this.queue) this.socket.send(chunk)
        this.queue = []; this.queuedBytes = 0
        this.emit({ type: 'ready' })
        this.flushFinish()
        break
      }
      case 'result-generated': {
        const output = e.payload?.output
        const s = output?.sentence ?? output?.output?.sentence
        if (!s || s.heartbeat === true || typeof s.text !== 'string') return
        if (s.sentence_end === true && Number.isInteger(s.sentence_id) && s.sentence_id > 0) this.sentences.set(s.sentence_id, s.text)
        const final = this.text()
        this.emit({ type: 'partial', text: s.sentence_end === true ? final : joinText(final, s.text) })
        break
      }
      case 'task-finished': {
        if (!this.finishSent) { this.fail('百炼任务意外结束'); return }
        const text = this.text().trim()
        this.ended = true
        clearTimeout(this.timer); clearTimeout(this.deadline)
        this.emit({ type: 'final', text })
        this.sentences.clear()
        this.socket.close()
        break
      }
      case 'task-failed':
        this.fail(`百炼识别失败（${String(e.header.error_code ?? 'UNKNOWN').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)}），请检查模型与配置`)
    }
  }
  private text(): string {
    return [...this.sentences].sort(([a], [b]) => a - b).reduce((text, [, sentence]) => joinText(text, sentence), '')
  }
}
