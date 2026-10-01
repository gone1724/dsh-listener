import { BASE, type SettingsView, type Preferences } from '../shared.ts'
let snapshot: SettingsView | null = null
const listeners = new Set<() => void>()
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
  save: (preferences: Preferences, revision: number, apiKey?: string, clearKey?: boolean) => request({
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences, revision, ...(apiKey ? { apiKey } : {}), ...(clearKey ? { clearKey: true } : {}) }),
  }),
}
