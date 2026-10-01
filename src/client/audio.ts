import { BASE, SAMPLE_RATE } from '../shared.ts'

/** Adapted lifecycle from Harness experimental voice input; pending grants also release tracks. */
export class Recording {
  private stream?: MediaStream
  private context?: AudioContext
  private source?: MediaStreamAudioSourceNode
  private node?: AudioWorkletNode
  private cancelled = false
  private stopped = false
  private stopping?: Promise<void>
  constructor(private chunk: (pcm: ArrayBuffer) => void, private interrupted: () => void) {}
  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('麦克风需要 localhost 或 HTTPS，以及支持 Web Audio 的浏览器')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false })
    if (this.cancelled) { stream.getTracks().forEach(track => track.stop()); throw new Error('录音已取消') }
    this.stream = stream
    try {
      this.context = new AudioContext({ sampleRate: SAMPLE_RATE })
      if (this.context.sampleRate !== SAMPLE_RATE) throw new Error('浏览器不支持 16 kHz 音频采集')
      await this.context.audioWorklet.addModule(`${BASE}/pcm-worklet.js`)
      if (this.cancelled) throw new Error('录音已取消')
      this.node = new AudioWorkletNode(this.context, 'dsh-speeker-pcm')
      this.node.port.onmessage = event => { if (!this.cancelled && event.data instanceof ArrayBuffer) this.chunk(event.data) }
      this.source = this.context.createMediaStreamSource(stream)
      this.source.connect(this.node)
      // The processor emits silence on its audio output; this keeps capture scheduled without mic feedback.
      this.node.connect(this.context.destination)
      for (const track of stream.getTracks()) track.onended = () => { if (!this.cancelled && !this.stopped) this.interrupted() }
      await this.context.resume()
      if (this.cancelled) throw new Error('录音已取消')
    } catch (error) { await this.cancel(); throw error }
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    this.stopping = this.finish()
    return this.stopping
  }
  private async finish(): Promise<void> {
    this.stopped = true
    const node = this.node
    // No new mic input after stop; flush the worklet's existing tail before finish-task.
    this.source?.disconnect()
    this.stream?.getTracks().forEach(track => track.stop())
    try {
      if (!node || this.cancelled) return
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('音频收尾超时')), 1500)
        node.port.onmessage = event => {
          if (this.cancelled) { clearTimeout(timer); resolve(); return }
          if (event.data instanceof ArrayBuffer) this.chunk(event.data)
          else if (event.data?.stopped) { clearTimeout(timer); resolve() }
        }
        node.port.postMessage('stop')
      })
    } finally { await this.release() }
  }
  async cancel(): Promise<void> { this.cancelled = true; await this.release() }
  private async release(): Promise<void> {
    this.source?.disconnect(); this.node?.disconnect()
    this.stream?.getTracks().forEach(track => track.stop())
    const context = this.context
    this.context = undefined
    if (context && context.state !== 'closed') await context.close().catch(() => undefined)
  }
}
