import { createServer } from 'node:http'
import { once } from 'node:events'
import { access, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { downloadArchive } from '../src/host/download.ts'
import type { UpdateProgress } from '../src/shared.ts'

function archive(version = '0.4.0') {
  const blocks: Buffer[] = []
  for (const [name, value] of Object.entries({ 'package.json': JSON.stringify({ name: 'dsh-listener', version }), 'lib/index.js': 'host', 'lib/client.js': 'client', 'lib/pcm-worklet.js': 'worklet', 'cordis.patch.yml': 'patch' })) {
    const body = Buffer.from(value), header = Buffer.alloc(512)
    header.write(`package/${name}`); header.write(body.length.toString(8).padStart(11, '0'), 124)
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
it('npm 安装包必须匹配 registry 的 SHA-512 完整性值', async () => {
  const bytes = archive()
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  const result = await downloadArchive('https://registry.npmjs.org/package.tgz', '0.4.0', vi.fn(), vi.fn(async () => new Response(bytes)) as any, integrity)
  await result.dispose()
  await expect(downloadArchive('https://registry.npmjs.org/package.tgz', '0.4.0', vi.fn(), vi.fn(async () => new Response(bytes)) as any, 'sha512-' + Buffer.alloc(64).toString('base64'))).rejects.toThrow('完整性校验失败')
})
it('安装器仍引用的持久安装包在 dispose 后保留，供后续 pnpm 操作读取', async () => {
  const bytes = archive()
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  const directory = join(tmpdir(), 'dsh-listener-test-archives')
  const result = await downloadArchive('https://registry.npmjs.org/package.tgz', '0.4.0', vi.fn(), vi.fn(async () => new Response(bytes)) as any, integrity, directory)
  try {
    await result.dispose()
    expect(await readFile(result.path)).toEqual(bytes)
  } finally { await unlink(result.path) }
})
