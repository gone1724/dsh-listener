export const BASE = '/dsh-speeker'
export const DEFAULT_MODEL = 'qwen-audio-3.1-asr-flash-streaming'
export const SAMPLE_RATE = 16000
export const MAX_AUDIO_BYTES = 16000 * 2 * 120
export const MAX_BUFFER_BYTES = 16000 * 2 * 15
export interface Preferences {
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
  return { model: p.model, region: p.region, workspaceId: p.workspaceId, hotkey: p.hotkey, mode: p.mode, autoSend: p.autoSend }
}
export function upstreamUrl(p: Preferences): string {
  const region = p.region === 'beijing' ? 'cn-beijing' : 'ap-southeast-1'
  const host = p.workspaceId ? `${p.workspaceId}.${region}.maas.aliyuncs.com`
    : p.region === 'beijing' ? 'dashscope.aliyuncs.com' : 'dashscope-intl.aliyuncs.com'
  return `wss://${host}/api-ws/v1/inference`
}
export function joinText(left: string, right: string): string {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return left + right
  return left + (/[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right) ? ' ' : '') + right
}
