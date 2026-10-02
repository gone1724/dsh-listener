import { createHash, randomUUID } from 'node:crypto'
import { open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gunzipSync } from 'node:zlib'
import type { UpdateProgress } from '../shared.ts'

const LIMIT = 32 * 1024 * 1024
/** Verify the downloaded archive itself before handing it to the official manager. */
function verifyArchive(bytes: Buffer, version: string): void {
  let tar: Buffer
  try { tar = gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }) }
  catch { throw new Error('下载包不是有效的 gzip 安装包，请检查镜像是否返回了错误页面') }
  const files = new Map<string, Buffer>()
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString().replace(/\0.*$/s, '')
    if (!name) break
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, '').trim(), 8) || 0
    if (size < 0 || offset + 512 + size > tar.length) throw new Error('下载包损坏')
    files.set(name, tar.subarray(offset + 512, offset + 512 + size))
    offset += 512 + Math.ceil(size / 512) * 512
  }
  const entry = [...files.keys()].find(name => /^[^/]+\/package\.json$/.test(name))
  if (!entry) throw new Error('下载包缺少插件清单，请检查镜像下载地址')
  const manifest = JSON.parse(files.get(entry)!.toString())
  const root = entry.slice(0, -'package.json'.length)
  if (manifest.name !== 'dsh-listener' || manifest.version !== version) throw new Error('下载包与目标插件版本不一致')
  for (const file of ['lib/index.js', 'lib/client.js', 'lib/pcm-worklet.js', 'cordis.patch.yml']) {
    if (!files.get(root + file)?.length) throw new Error(`下载包缺少 ${file}`)
  }
}
export async function downloadArchive(url: string, version: string, progress: (value: UpdateProgress) => void, fetcher: typeof fetch = fetch, integrity?: string) {
  const path = join(tmpdir(), `dsh-listener-${randomUUID()}.tgz`)
  const file = await open(path, 'wx')
  const dispose = () => unlink(path)
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(120000) })
    if (!response.ok || !response.body) throw new Error(`安装包下载失败（HTTP ${response.status}）`)
    const length = Number(response.headers.get('content-length'))
    const total = Number.isSafeInteger(length) && length > 0 ? length : undefined
    if (total && total > LIMIT) { await response.body.cancel(); throw new Error('安装包超过 32 MB 限制') }
    let received = 0
    progress({ phase: 'downloading', received, total })
    const reader = response.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        if (received > LIMIT) throw new Error('安装包超过 32 MB 限制')
        await file.writeFile(value)
        progress({ phase: 'downloading', received, total })
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    await file.close()
    if (total && total !== received) throw new Error('安装包下载不完整，请重试')
    const bytes = await readFile(path)
    if (integrity && `sha512-${createHash('sha512').update(bytes).digest('base64')}` !== integrity) throw new Error('安装包完整性校验失败，请重试或更换 npm 下载来源')
    verifyArchive(bytes, version)
    return { path, dispose }
  } catch (error) {
    await file.close().catch(() => {})
    await dispose().catch(() => {})
    throw error
  }
}
