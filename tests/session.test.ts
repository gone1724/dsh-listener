import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const audio = vi.hoisted(() => ({ starts: [] as (() => void)[], chunks: [] as ((chunk: ArrayBuffer) => void)[], stops: 0, cancels: 0 }))
vi.mock('../src/client/audio.ts', () => ({ Recording: class {
  constructor(chunk: (data: ArrayBuffer) => void) { audio.chunks.push(chunk) }
  start() { return new Promise<void>(resolve => audio.starts.push(resolve)) }
  async stop() { audio.stops++; audio.chunks.at(-1)?.(new ArrayBuffer(2)) }
  async cancel() { audio.cancels++ }
} }))
import { VoiceSession } from '../src/client/session.ts'
import { MAX_AUDIO_BYTES } from '../src/shared.ts'
class Socket {
  static OPEN = 1
  static instances: Socket[] = []
  readyState = 1; bufferedAmount = 0
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: any[] = []
  constructor() { Socket.instances.push(this) }
  send(data: any) { this.sent.push(data) }
  close() { this.readyState = 3 }
  message(data: object) { this.onmessage?.({ data: JSON.stringify(data) }) }
}
beforeEach(() => {
  audio.starts = []; audio.chunks = []; audio.stops = 0; audio.cancels = 0; Socket.instances = []
  vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('window', { location: { href: 'http://localhost/' } })
})
afterEach(() => vi.unstubAllGlobals())
it('权限申请时松键取消，不会在迟到授权后开始持续录音', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start()
  await session.finish(); audio.starts[0](); await start
  expect(session.getSnapshot().phase).toBe('idle'); expect(audio.cancels).toBeGreaterThan(0)
  expect(Socket.instances[0].readyState).toBe(3); expect(final).not.toHaveBeenCalled()
})
it('浏览器先暂存音频，连接就绪后上传，flush 尾音后再结束', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0]
  const pcm = new ArrayBuffer(3200); audio.chunks[0](pcm)
  expect(socket.sent).toEqual([])
  socket.message({ type: 'ready' }); expect(socket.sent).toEqual([pcm])
  await session.finish()
  expect(socket.sent[1]).toBeInstanceOf(ArrayBuffer)
  expect(JSON.parse(socket.sent[2])).toEqual({ type: 'finish' })
  socket.message({ type: 'partial', text: '临时' }); expect(final).not.toHaveBeenCalled()
  socket.message({ type: 'final', text: '最终。' }); expect(final).toHaveBeenCalledExactlyOnceWith('最终。')
})
it('停止时连接尚未就绪，连接就绪后先发全部音频再发结束', async () => {
  const session = new VoiceSession(vi.fn())
  const start = session.start(); audio.starts[0](); await start
  audio.chunks[0](new ArrayBuffer(3200)); await session.finish()
  const socket = Socket.instances[0]; expect(socket.sent).toEqual([])
  socket.message({ type: 'ready' })
  expect(socket.sent).toHaveLength(3); expect(JSON.parse(socket.sent[2]).type).toBe('finish')
  session.cancel()
})
it('取消后丢弃迟到结果，连接中断停止麦克风', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0], late = socket.onmessage
  socket.onclose?.()
  late?.({ data: JSON.stringify({ type: 'final', text: '不该出现' }) })
  expect(session.getSnapshot().phase).toBe('error'); expect(audio.cancels).toBeGreaterThan(0)
  expect(final).not.toHaveBeenCalled()
})
it('到时长上限会正常收尾，不因最后一个音频块超限丢掉整次录音', async () => {
  const final = vi.fn(), session = new VoiceSession(final)
  const start = session.start(); audio.starts[0](); await start
  const socket = Socket.instances[0]; socket.message({ type: 'ready' })
  for (let i = 0; i < MAX_AUDIO_BYTES / 3200 + 1; i++) audio.chunks[0](new ArrayBuffer(3200))
  await Promise.resolve(); await Promise.resolve()
  expect(socket.sent.filter(v => v instanceof ArrayBuffer).reduce((size, v) => size + v.byteLength, 0)).toBe(MAX_AUDIO_BYTES)
  expect(JSON.parse(socket.sent.at(-1)).type).toBe('finish')
  socket.message({ type: 'final', text: '完整录音' }); expect(final).toHaveBeenCalledExactlyOnceWith('完整录音')
})
