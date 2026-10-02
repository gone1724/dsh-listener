export const BASE = '/dsh-listener'
export const DEFAULT_MODEL = 'qwen-audio-3.1-asr-flash-streaming'
export const SAMPLE_RATE = 16000
export const MAX_AUDIO_BYTES = 16000 * 2 * 120
export const MAX_BUFFER_BYTES = 16000 * 2 * 15
export const VERSION = '0.3.12'
export interface UpdateSource {
  updateSource: 'official' | 'mirror'
  mirrorUrl: string
}
export interface UpdateProgress {
  phase: 'idle' | 'checking' | 'downloading' | 'installing' | 'done' | 'error'
  received: number
  total?: number
}
export interface Preferences extends UpdateSource {
  model: string
  region: 'beijing' | 'singapore'
  workspaceId: string
  hotkey: string
  mode: 'hold' | 'toggle'
  autoSend: boolean
}
export interface SettingsView extends Preferences {
  configured: boolean
  writable: boolean
  revision: number
}
export const defaults: Preferences = {
  model: DEFAULT_MODEL, region: 'beijing', workspaceId: '', hotkey: 'AltRight', mode: 'hold', autoSend: false,
  updateSource: 'official', mirrorUrl: 'https://registry.npmmirror.com',
}

export function validateUpdateSource(input: Partial<UpdateSource>, requireMirror = true): UpdateSource {
  const updateSource = input.updateSource ?? 'official'
  if (updateSource !== 'official' && updateSource !== 'mirror') throw new Error('更新下载来源无效')
  if (input.mirrorUrl !== undefined && typeof input.mirrorUrl !== 'string') throw new Error('镜像网址无效')
  const previousUrl = (input.mirrorUrl ?? '').trim().replace(/\/+$/, '')
  // Migrate GitHub proxy settings: those proxies cannot serve npm registry requests.
  const mirrorUrl = /^https:\/\/(?:gh-proxy\.(?:org|com)|ghproxy\.com)(?:\/|$)/i.test(previousUrl) ? defaults.mirrorUrl : previousUrl
  if (mirrorUrl) {
    try {
      const url = new URL(mirrorUrl)
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || mirrorUrl.length > 512) throw new Error()
    } catch { throw new Error('镜像网址须为 HTTPS npm registry 地址，不包含账号、查询参数或下载链接') }
  }
  if (requireMirror && updateSource === 'mirror' && !mirrorUrl) throw new Error('请先填写 npm 镜像网址')
  return { updateSource, mirrorUrl: mirrorUrl.replace(/\/+$/, '') }
}

/** Only the DashScope run-task protocol is supported; model IDs are not arbitrary endpoints. */
export function validatePreferences(input: unknown): Preferences {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('设置格式无效')
  const p = input as Record<string, unknown>
  if (typeof p.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(p.model)) throw new Error('模型名称无效')
  if (p.region !== 'beijing' && p.region !== 'singapore') throw new Error('地域无效')
  if (typeof p.workspaceId !== 'string' || !/^[a-zA-Z0-9-]{0,64}$/.test(p.workspaceId)) throw new Error('Workspace ID 无效')
  if (typeof p.hotkey !== 'string' || !/^(?:(?:Control|Shift|Alt|Meta)\+)*(?:AltRight|AltLeft|ControlRight|ControlLeft|ShiftRight|ShiftLeft|MetaRight|MetaLeft|Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Space)$/.test(p.hotkey)) throw new Error('快捷键无效')
  if (p.mode !== 'hold' && p.mode !== 'toggle') throw new Error('录音模式无效')
  if (typeof p.autoSend !== 'boolean') throw new Error('自动发送设置无效')
  const source = validateUpdateSource({ updateSource: p.updateSource as UpdateSource['updateSource'], mirrorUrl: (p.mirrorUrl ?? defaults.mirrorUrl) as string }, false)
  return { model: p.model, region: p.region, workspaceId: p.workspaceId, hotkey: p.hotkey, mode: p.mode, autoSend: p.autoSend, ...source }
}
export function upstreamUrl(p: Preferences): string {
  const region = p.region === 'beijing' ? 'cn-beijing' : 'ap-southeast-1'
  const host = p.workspaceId ? `${p.workspaceId}.${region}.maas.aliyuncs.com`
    : p.region === 'beijing' ? 'dashscope.aliyuncs.com' : 'dashscope-intl.aliyuncs.com'
  return `wss://${host}/api-ws/v1/inference`
}
/** Accept only official workspace hosts; never allow an arbitrary upload destination. */
export function workspaceFromHost(value: string): { workspaceId: string; region: Preferences['region'] } | undefined {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    if (!['https:', 'wss:'].includes(url.protocol) || url.username || url.password || url.port) return
    const match = /^([a-zA-Z0-9-]{1,64})\.(cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/.exec(url.hostname)
    if (match) return { workspaceId: match[1], region: match[2] === 'cn-beijing' ? 'beijing' : 'singapore' }
  } catch { /* Not a complete workspace host. */ }
}
export function joinText(left: string, right: string): string {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return left + right
  return left + (/[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right) ? ' ' : '') + right
}
