import { createServer } from 'node:http'
import { once } from 'node:events'
import { access, readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { expect, it, vi } from 'vitest'
import { downloadArchive } from '../src/host/download.ts'
import type { UpdateProgress } from '../src/shared.ts'

function archive(version = '0.4.0') {
  const blocks: Buffer[] = []
  for (const [name, value] of Object.entries({ 'package.json': JSON.stringify({ name: 'dsh-speeker', version }), 'lib/index.js': 'host', 'lib/client.js': 'client', 'lib/pcm-worklet.js': 'worklet', 'cordis.patch.yml': 'patch' })) {
    const body = Buffer.from(value), header = Buffer.alloc(512)
    header.write(`source/${name}`); header.write(body.length.toString(8).padStart(11, '0'), 124)
    blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}
it.each([true, false])('真实 HTTP 分块下载显示字节，Content-Length 存在=%s；清理仅删除本次临时文件', async (knownLength) => {
  const bytes = archive(), progress: UpdateProgress[] = []
  const server = createServer((_req, res) => {
    if (knownLength) res.setHeader('Content-Length', bytes.length)
    res.write(bytes.subarray(0, 20)); setTimeout(() => res.end(bytes.subarray(20)), 30)
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try {
    const result = await downloadArchive(`http://127.0.0.1:${(server.address() as { port: number }).port}/package.tar.gz`, '0.4.0', value => progress.push(value))
    try {
      expect(await readFile(result.path)).toEqual(bytes)
      expect(progress.at(-1)).toEqual({ phase: 'downloading', received: bytes.length, total: knownLength ? bytes.length : undefined })
      expect(progress.some(value => value.received > 0 && value.received < bytes.length)).toBe(true)
    } finally { await result.dispose() }
    await expect(access(result.path)).rejects.toThrow()
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
it('拒绝版本错误的压缩包、镜像 HTML 页面和 HTTP 错误，不交给安装器', async () => {
  await expect(downloadArchive('https://mirror.example/package.tar.gz', '0.4.0', vi.fn(), vi.fn(async () => new Response(archive('0.3.0'))) as any)).rejects.toThrow('版本不一致')
  await expect(downloadArchive('https://mirror.example/package.tar.gz', '0.4.0', vi.fn(), vi.fn(async () => new Response('<html>proxy error</html>')) as any)).rejects.toThrow()
  await expect(downloadArchive('https://mirror.example/package.tar.gz', '0.4.0', vi.fn(), vi.fn(async () => new Response('', { status: 503 })) as any)).rejects.toThrow('HTTP 503')
})
