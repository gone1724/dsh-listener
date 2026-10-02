import { expect, it } from 'vitest'
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket, { WebSocketServer } from 'ws'
import { BailianTask, type VoiceEvent } from '../src/host/bailian.ts'
import { defaults } from '../src/shared.ts'

it('真实 WebSocket 完成音频上传与停止后的最终识别', async () => {
  const server = createServer(), upstream = new WebSocketServer({ server })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const port = (server.address() as { port: number }).port
  const frames: Buffer[] = [], events: VoiceEvent[] = []
  let receivedKey = ''
  const final = Promise.withResolvers<VoiceEvent>()
  upstream.on('connection', (socket, req) => {
    receivedKey = req.headers.authorization ?? ''
    let id = ''
    socket.on('message', (data, binary) => {
      if (binary) { frames.push(Buffer.from(data as Buffer)); return }
      const e = JSON.parse(data.toString()); id = e.header.task_id
      const send = (event: string, sentence?: unknown) => socket.send(JSON.stringify({ header: { event, task_id: id }, payload: { output: { sentence } } }))
      if (e.header.action === 'run-task') send('task-started')
      if (e.header.action === 'finish-task') {
        send('result-generated', { sentence_id: 1, sentence_end: true, text: '完整句尾。' })
        send('task-finished')
      }
    })
  })
  const task = new BailianTask(defaults, 'test-key', event => { events.push(event); if (event.type === 'final' || event.type === 'error') final.resolve(event) },
    (_url, key) => new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Authorization: `Bearer ${key}` } }))
  try {
    task.sendAudio(Buffer.alloc(3200, 1)); task.sendAudio(Buffer.alloc(3200, 2)); task.finish()
    expect(await final.promise).toEqual({ type: 'final', text: '完整句尾。' })
    expect(receivedKey).toBe('Bearer test-key')
    expect(frames).toEqual([Buffer.alloc(3200, 1), Buffer.alloc(3200, 2)])
    expect(events[0]).toEqual({ type: 'ready' })
  } finally {
    task.cancel(); for (const client of upstream.clients) client.terminate()
    await new Promise<void>(resolve => upstream.close(() => resolve()))
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
