// Native Web Audio runs at 16 kHz. Only PCM16 mono crosses the plugin transport.
class SpeekerPCM extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = new Int16Array(1600)
    this.offset = 0
    this.active = true
    this.port.onmessage = event => {
      if (event.data === 'stop') {
        this.active = false
        this.flush()
        this.port.postMessage({ stopped: true })
      }
    }
  }
  flush() {
    if (!this.offset) return
    const bytes = new ArrayBuffer(this.offset * 2)
    const view = new DataView(bytes)
    for (let i = 0; i < this.offset; i++) view.setInt16(i * 2, this.samples[i], true)
    this.port.postMessage(bytes, [bytes])
    this.offset = 0
  }
  process(inputs) {
    if (!this.active) return false
    const channels = inputs[0]
    if (!channels || !channels[0]) return true
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0
      for (const channel of channels) sample += channel[i] / channels.length
      sample = Math.max(-1, Math.min(1, sample))
      this.samples[this.offset++] = Math.round(sample * (sample < 0 ? 32768 : 32767))
      if (this.offset === this.samples.length) this.flush()
    }
    return true
  }
}
registerProcessor('dsh-speeker-pcm', SpeekerPCM)
