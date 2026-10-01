import type { Context } from '@deepseek-ai/cordis'
import PluginManager from '@deepseek-ai/dsh-plugin-manager'
import HMR from '@deepseek-ai/dsh-hmr'
import { BASE, VERSION } from '../shared.ts'

const REPOSITORY = 'gone1724/dsh-listener'
const managers = new WeakMap<Context, Promise<PluginManager>>()
export function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}
export async function latestRelease(fetcher: typeof fetch = fetch) {
  const options = { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-speeker' }, signal: AbortSignal.timeout(10000) }
  const response = await fetcher(`https://api.github.com/repos/${REPOSITORY}/tags?per_page=100`, options)
  if (!response.ok) throw new Error(`GitHub 检查更新失败（HTTP ${response.status}）`)
  const tags = await response.json() as { name: string }[]
  if (!Array.isArray(tags)) throw new Error('GitHub 更新响应无效')
  const versions = tags.map(tag => /^v(\d+\.\d+\.\d+)$/.exec(tag.name)?.[1]).filter((v): v is string => !!v).sort((a, b) => compareVersions(b, a))
  if (!versions.length) throw new Error('仓库尚无正式发布版本')
  const version = versions[0]
  const manifest = await fetcher(`https://raw.githubusercontent.com/${REPOSITORY}/v${version}/package.json`, { signal: AbortSignal.timeout(10000) })
  if (!manifest.ok) throw new Error('无法验证发布版本的安装清单')
  const pkg = await manifest.json() as { name?: string; version?: string }
  if (pkg.name !== 'dsh-speeker' || pkg.version !== version) throw new Error('发布标签与插件版本不一致')
  return { version, spec: `github:${REPOSITORY}#v${version}` }
}
async function manager(ctx: Context): Promise<PluginManager> {
  const existing = ctx.get('pluginManager') as PluginManager | undefined
  if (existing) { await enableProfileReload(ctx); return existing }
  if (!ctx.get('profileContext') || !ctx.get('loader')) throw new Error('当前运行方式没有插件管理能力，请在 Desktop 插件管理中操作')
  // Install at the application root so a self-uninstall cannot abort its package operation.
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
export function mountManagement(ctx: Context, active: () => number, fetcher: typeof fetch = fetch, getManager = manager) {
  let busy = false
  return ctx.webServer.register({ kind: 'exact', path: `${BASE}/manage`, handler: async (req, res) => {
    const reply = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
    const admission = ctx.connection.admit(req)
    if ('rejection' in admission) { reply(admission.rejection, { error: 'Harness 登录或页面来源验证失败' }); return }
    if (req.method !== 'POST') { reply(405, { error: '方法不支持' }); return }
    const action = new URL(req.url ?? '/', 'http://localhost').searchParams.get('action')
    if (!['check', 'update', 'uninstall'].includes(action ?? '')) { reply(400, { error: '操作无效' }); return }
    if (busy) { reply(409, { error: '已有插件管理操作正在进行' }); return }
    if (active() > 0 && action !== 'check') { reply(409, { error: '请先结束录音，再更新或卸载插件' }); return }
    busy = true
    try {
      if (action === 'check') {
        const latest = await latestRelease(fetcher)
        await getManager(ctx)
        reply(200, { current: VERSION, latest: latest.version, available: compareVersions(latest.version, VERSION) > 0 }); return
      }
      const service = await getManager(ctx)
      let result
      if (action === 'update') {
        // The server chooses and verifies the fixed repository/tag; no caller-supplied shell/spec.
        const latest = await latestRelease(fetcher)
        if (compareVersions(latest.version, VERSION) <= 0) { reply(200, { application: 'unchanged', message: '当前已是最新版本' }); return }
        result = await service.installBundle(latest.spec)
      } else result = await service.removeBundle('dsh-speeker')
      if (result.application === 'failed' || result.application === 'cancelled' || result.application === 'overridden') {
        reply(400, { error: `插件管理操作未完成（${result.error?.code ?? result.application}）。请在 Desktop 插件管理中查看详情。` }); return
      }
      reply(200, { application: result.application, message: action === 'uninstall' ? '插件已卸载，设置和密钥保留。' : result.application === 'restart-required' ? '新版已安装，请完全退出并重新打开 Desktop。' : '更新已应用；如界面仍显示旧版本，请重新打开页面。' })
    } catch (error) { reply(400, { error: error instanceof Error ? error.message : '插件管理失败' }) }
    finally { busy = false }
  } })
}
