import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BailianTask, type VoiceEvent } from '../src/host/bailian.ts'
import { defaults, MAX_AUDIO_BYTES, MAX_BUFFER_BYTES, upstreamUrl, validatePreferences } from '../src/shared.ts'

class Socket extends EventEmitter {
  readyState = 1; bufferedAmount = 0
  sent: (string | Buffer)[] = []
  send(data: string | Buffer) { this.sent.push(data) }
  close = vi.fn()
  terminate = vi.fn()
}
function setup() {
  const socket = new Socket(), events: VoiceEvent[] = []
  const factory = vi.fn(() => socket)
  const task = new BailianTask(defaults, 'secret', e => events.push(e), factory)
  const event = (type: string, sentence?: object, taskId = task.taskId) => socket.emit('message', JSON.stringify({ header: { event: type, task_id: taskId }, payload: { output: { sentence } } }))
  return { task, socket, events, event, factory }
}
afterEach(() => vi.useRealTimers())
describe('百炼流式任务', () => {
  it('等待 task-started，音频按顺序发送，再发送 finish-task', () => {
    const s = setup()
    s.socket.emit('open')
    const a = Buffer.from([1, 0]), b = Buffer.from([2, 0])
    s.task.sendAudio(a); s.task.sendAudio(b); s.task.finish()
    expect(s.socket.sent).toHaveLength(1)
    s.event('task-started')
    expect(s.socket.sent.slice(1, 3)).toEqual([a, b])
    expect(JSON.parse(s.socket.sent[3] as string).header.action).toBe('finish-task')
    s.event('task-finished'); expect(s.socket.close).toHaveBeenCalledOnce()
  })
  it('临时结果不进入最终文本，重复句子去重，收尾结果不丢失', () => {
    const s = setup(); s.socket.emit('open'); s.event('task-started')
    s.task.sendAudio(Buffer.alloc(3200))
    s.event('result-generated', { text: '错误临时结果', sentence_end: false, sentence_id: 1 })
    s.event('result-generated', { text: '你好。', sentence_end: true, sentence_id: 1 })
    s.event('result-generated', { text: '你好。', sentence_end: true, sentence_id: 1 })
    s.task.finish()
    s.event('result-generated', { text: '这是句尾。', sentence_end: true, sentence_id: 2 })
    s.event('task-finished')
    expect(s.events.at(-1)).toEqual({ type: 'final', text: '你好。这是句尾。' })
  })
  it('乱序句子按 ID 合并，英文保留间隔，心跳不成为文字', () => {
    const s = setup(); s.event('task-started'); s.task.sendAudio(Buffer.alloc(2))
    s.event('result-generated', { text: 'world', sentence_end: true, sentence_id: 2 })
    s.event('result-generated', { text: 'hello', sentence_end: true, sentence_id: 1 })
    s.event('result-generated', { text: 'noise', heartbeat: true, sentence_end: true, sentence_id: 0 })
    s.task.finish(); s.event('task-finished')
    expect(s.events.at(-1)).toEqual({ type: 'final', text: 'hello world' })
  })
  it('取消释放连接并使迟到结果失效', () => {
    const s = setup(); s.task.cancel(); s.event('task-started'); s.event('task-finished')
    expect(s.socket.terminate).toHaveBeenCalledOnce(); expect(s.events).toEqual([])
  })
  it('提前断线不把临时文字当作成功结果', () => {
    const s = setup(); s.socket.emit('close')
    expect(s.events.at(-1)?.type).toBe('error')
  })
  it('忽略其他任务的结果', () => {
    const s = setup(); s.event('task-finished', undefined, 'another-task')
    expect(s.events).toEqual([]); s.task.cancel()
  })
  it('等待连接和最终结果均有超时', () => {
    vi.useFakeTimers()
    const a = setup(); vi.advanceTimersByTime(15001); expect(a.events.at(-1)?.type).toBe('error')
    const b = setup(); b.event('task-started'); b.task.sendAudio(Buffer.alloc(2)); b.task.finish()
    vi.advanceTimersByTime(20001); expect(b.events.at(-1)?.type).toBe('error')
  })
  it('限制连接期间缓冲和总录音长度', () => {
    const a = setup()
    for (let i = 0; i <= MAX_BUFFER_BYTES / 32000; i++) a.task.sendAudio(Buffer.alloc(32000))
    expect(a.events.at(-1)?.type).toBe('error')
    const b = setup(); b.event('task-started')
    for (let i = 0; i <= MAX_AUDIO_BYTES / 32000; i++) b.task.sendAudio(Buffer.alloc(32000))
    expect(b.events.at(-1)?.type).toBe('error')
  })
  it('接近两分钟停止后仍允许完整的 20 秒收尾等待', () => {
    vi.useFakeTimers()
    const s = setup(); s.event('task-started')
    vi.advanceTimersByTime(10000); s.task.sendAudio(Buffer.alloc(2))
    vi.advanceTimersByTime(120000); s.task.finish()
    vi.advanceTimersByTime(19000)
    expect(s.socket.terminate).not.toHaveBeenCalled()
    s.event('result-generated', { sentence_id: 1, sentence_end: true, text: '句尾结果' })
    s.event('task-finished')
    expect(s.events.at(-1)).toEqual({ type: 'final', text: '句尾结果' })
  })
  it('不允许任意 URL 或无效模型进入配置', () => {
    expect(() => validatePreferences({ ...defaults, model: 'https://evil.example' })).toThrow()
    expect(() => validatePreferences({ ...defaults, workspaceId: 'evil.example/' })).toThrow()
    expect(upstreamUrl({ ...defaults, workspaceId: 'workspace-123' })).toBe('wss://workspace-123.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference')
    expect(upstreamUrl({ ...defaults, region: 'singapore' })).toContain('dashscope-intl.aliyuncs.com')
  })
})
