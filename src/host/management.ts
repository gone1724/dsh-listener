import type { Context } from '@deepseek-ai/cordis'
import PluginManager from '@deepseek-ai/dsh-plugin-manager'
import HMR from '@deepseek-ai/dsh-hmr'
import { BASE, VERSION, validateUpdateSource, type UpdateSource, type UpdateProgress } from '../shared.ts'
import { downloadArchive } from './download.ts'

const REGISTRY = 'https://registry.npmjs.org'
const managers = new WeakMap<Context, Promise<PluginManager>>()
function managementError(code: string): string {
  if (code === 'bundle-in-use') return '旧版插件仍被宿主加载，本次操作未完成。请在 Desktop 插件管理中禁用语音输入，完全退出并重开 Desktop，再从 Desktop 插件管理安装新版。'
  if (code === 'stop-profile') return '宿主无法在运行中替换此插件。请停止当前 profile，再从 Desktop 插件管理操作。'
  if (/timeout/i.test(code)) return '安装超时。请在 Desktop 插件管理中查看详情后重试。'
  return `插件管理操作未完成（${code}）。请在 Desktop 插件管理中查看详情。`
}
export function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}
export function updateUrl(url: string, source: UpdateSource): string {
  return source.updateSource === 'mirror' ? `${source.mirrorUrl}${new URL(url).pathname}` : url
}
export async function latestRelease(fetcher: typeof fetch = fetch, input: Partial<UpdateSource> = {}) {
  const source = validateUpdateSource(input)
  const response = await fetcher(updateUrl(`${REGISTRY}/dsh-listener/latest`, source), {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`npm latest 检查更新失败（HTTP ${response.status}）`)
  const pkg = await response.json() as { name?: string; version?: string; dist?: { tarball?: string; integrity?: string } }
  if (pkg?.name !== 'dsh-listener' || typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('npm latest 插件清单无效')
  const tarball = `${REGISTRY}/dsh-listener/-/dsh-listener-${pkg.version}.tgz`
  // Only download this package's fixed archive, never an arbitrary URL from metadata.
  if (!pkg.dist?.tarball || ![tarball, updateUrl(tarball, source)].includes(pkg.dist.tarball)) throw new Error('npm 安装包地址无效')
  if (!pkg.dist.integrity || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(pkg.dist.integrity)) throw new Error('npm 安装包缺少有效的完整性校验')
  return { version: pkg.version, tarball: updateUrl(tarball, source), integrity: pkg.dist.integrity }
}
async function manager(ctx: Context): Promise<PluginManager> {
  const existing = ctx.get('pluginManager') as PluginManager | undefined
  if (existing) { await enableProfileReload(ctx); return existing }
  if (!ctx.get('profileContext') || !ctx.get('loader')) throw new Error('当前运行方式没有插件管理能力，请在 Desktop 插件管理中操作')
  // Keep the manager alive at the application root during plugin replacement.
  let pending = managers.get(ctx.root)
  if (!pending) {
    pending = (async () => {
      await enableProfileReload(ctx)
      const fiber = ctx.root.plugin(PluginManager, {})
      await fiber.await()
      const service = ctx.root.get('pluginManager') as PluginManager | undefined
      if (!service) throw new Error('插件管理服务未就绪')
      return service
    })()
    managers.set(ctx.root, pending)
    void pending.catch(() => managers.delete(ctx.root))
  }
  return pending
}
async function enableProfileReload(ctx: Context): Promise<void> {
  if (ctx.get('hmr')) return
  if (!ctx.get('timer') || !ctx.get('profileContext')) throw new Error('宿主缺少热加载服务，请在 Desktop 插件管理中操作')
  // Configuration watches only: never start watching unrelated workspace source.
  const hmr = ctx.root.plugin(HMR, { root: [], debounce: 100, ignored: ['**/node_modules', '**/.*', 'cache', 'data'] })
  await hmr.await()
}
export function mountManagement(ctx: Context, active: () => number, fetcher: typeof fetch = fetch, getManager = manager, download = downloadArchive) {
  let busy = false
  let progress: UpdateProgress = { phase: 'idle', received: 0 }
  return ctx.webServer.register({ kind: 'exact', path: `${BASE}/manage`, handler: async (req, res) => {
    const reply = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
    const admission = ctx.connection.admit(req)
    if ('rejection' in admission) { reply(admission.rejection, { error: 'Harness 登录或页面来源验证失败' }); return }
    const query = new URL(req.url ?? '/', 'http://localhost').searchParams
    const action = query.get('action')
    if (req.method === 'GET' && action === 'progress') { reply(200, progress); return }
    if (req.method !== 'POST') { reply(405, { error: '方法不支持' }); return }
    if (!['check', 'update'].includes(action ?? '')) { reply(400, { error: '操作无效' }); return }
    if (busy) { reply(409, { error: '已有插件管理操作正在进行' }); return }
    if (active() > 0 && action !== 'check') { reply(409, { error: '请先结束录音，再更新插件' }); return }
    busy = true
    if (action === 'update') progress = { phase: 'checking', received: 0 }
    try {
      const source = validateUpdateSource({
        updateSource: (query.get('updateSource') ?? 'official') as UpdateSource['updateSource'], mirrorUrl: query.get('mirrorUrl') ?? '',
      })
      if (action === 'check') {
        const latest = await latestRelease(fetcher, source)
        reply(200, { current: VERSION, latest: latest.version, available: compareVersions(latest.version, VERSION) > 0 }); return
      }
      // Resolve the latest channel again and pin the exact version for this installation.
      const latest = await latestRelease(fetcher, source)
      if (compareVersions(latest.version, VERSION) <= 0) { progress = { phase: 'done', received: 0 }; reply(200, { application: 'unchanged', message: '当前已是最新版本' }); return }
      const service = await getManager(ctx)
      progress = { phase: 'downloading', received: 0 }
      const archive = await download(latest.tarball, latest.version, value => { progress = value }, fetcher, latest.integrity)
      let result
      try {
        progress = { ...progress, phase: 'installing' }
        result = await service.installBundle(archive.path)
      } finally { await archive.dispose().catch(() => {}) }
      if (result.application === 'failed' || result.application === 'cancelled' || result.application === 'overridden') {
        progress = { ...progress, phase: 'error' }
        reply(400, { error: managementError(result.error?.code ?? result.application) }); return
      }
      progress = { ...progress, phase: 'done' }
      reply(200, { application: result.application, message: result.application === 'restart-required' ? '新版已安装，请完全退出并重新打开 Desktop。' : '更新已应用；如界面仍显示旧版本，请重新打开页面。' })
    } catch (error) {
      if (action === 'update') progress = { ...progress, phase: 'error' }
      const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
      const invalidJson = error instanceof SyntaxError
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined
      reply(400, { error: timeout ? 'npm 更新连接超时。请检查网络，或切换 npm 镜像后重试。'
        : invalidJson ? '更新服务未返回有效 JSON。请检查填写的网址是否为 npm registry。'
        : code ? managementError(code) : error instanceof Error ? error.message : '插件管理失败' })
    }
    finally { busy = false }
  } })
}
