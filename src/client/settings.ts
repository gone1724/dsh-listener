import { BASE, validateUpdateSource, type UpdateProgress, type UpdateSource, type SettingsView, type Preferences } from '../shared.ts'
let snapshot: SettingsView | null = null
const listeners = new Set<() => void>()
let writes = Promise.resolve<unknown>(undefined)
function write(body: Record<string, unknown>, revision: number): Promise<SettingsView> {
  const next = writes.then(() => request({ method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, revision: snapshot?.revision ?? revision }),
  }))
  writes = next.catch(() => undefined)
  return next
}
function publish(value: SettingsView): void { snapshot = value; for (const fn of listeners) fn() }
async function request(options?: RequestInit): Promise<SettingsView> {
  const response = await fetch(`${BASE}/config`, { credentials: 'same-origin', ...options })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? '无法读取语音设置')
  publish(result)
  return result
}
export const settings = {
  getSnapshot: () => snapshot,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  refresh: () => request(),
  progress: async (signal: AbortSignal): Promise<UpdateProgress> => {
    const response = await fetch(`${BASE}/manage?action=progress`, { credentials: 'same-origin', signal })
    if (!response.ok) throw new Error('无法读取更新进度')
    return response.json()
  },
  manage: async (action: 'check' | 'update' | 'uninstall', source?: UpdateSource): Promise<{ current?: string; latest?: string; available?: boolean; message?: string; application?: string }> => {
    const query = new URLSearchParams({ action, ...(action === 'uninstall' ? {} : validateUpdateSource(source ?? {})) })
    const response = await fetch(`${BASE}/manage?${query}`, { method: 'POST', credentials: 'same-origin' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? '插件管理失败')
    return result
  },
  saveDownload: (source: UpdateSource) => write({ updateDownload: validateUpdateSource(source, false) }, snapshot?.revision ?? 0),
  save: (preferences: Preferences, revision: number, apiKey?: string, clearKey?: boolean) => write({ preferences, ...(apiKey ? { apiKey } : {}), ...(clearKey ? { clearKey: true } : {}) }, revision),
}
