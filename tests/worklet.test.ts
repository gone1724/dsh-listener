import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { expect, it } from 'vitest'
it('AudioWorklet 输出单声道小端 PCM16 并在停止时提交残余音频', () => {
  const messages: any[] = []
  let Processor: any
  class Base { port = { postMessage: (data: unknown) => messages.push(data), onmessage: (_event: any) => {} } }
  vm.runInNewContext(readFileSync('src/client/pcm-worklet.js', 'utf8'), { AudioWorkletProcessor: Base, registerProcessor: (_name: string, klass: any) => { Processor = klass }, Int16Array, ArrayBuffer, DataView })
  const p = new Processor()
  p.process([[new Float32Array([1, -1, .5]), new Float32Array([1, -1, .5])]])
  expect(messages).toHaveLength(0)
  p.port.onmessage({ data: 'stop' })
  const view = new DataView(messages[0])
  expect([view.getInt16(0, true), view.getInt16(2, true), view.getInt16(4, true)]).toEqual([32767, -32768, 16384])
  expect(messages[1]).toEqual({ stopped: true })
  expect(p.process([])).toBe(false)
})
