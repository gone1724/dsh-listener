import { expect, it, vi } from 'vitest'
import { defaults } from '../src/shared.ts'

it('下载设置使用队列版本，手动表单保留自己的版本以检测冲突', async () => {
  vi.resetModules()
  const { settings } = await import('../src/client/settings.ts')
  let revision = 0
  const calls: any[] = []
  const fetcher = vi.fn(async (_url: string, options: any) => {
    if (options?.body) {
      const body = JSON.parse(options.body); calls.push(body)
      if (body.revision !== revision) return { ok: false, json: async () => ({ error: 'conflict' }) }
      revision++
    }
    return { ok: true, json: async () => ({ ...defaults, configured: true, writable: true, revision }) }
  })
  vi.stubGlobal('fetch', fetcher)
  try {
    await settings.refresh()
    const auto = settings.saveDownload({ updateSource: 'mirror', mirrorUrl: 'https://mirror.example' })
    const manual = settings.save({ ...defaults, model: 'another-model' }, 0)
    await auto
    await expect(manual).rejects.toThrow('conflict')
    expect(calls[0]).toEqual({ updateDownload: { updateSource: 'mirror', mirrorUrl: 'https://mirror.example' }, revision: 0 })
    expect(calls[0]).not.toHaveProperty('apiKey'); expect(calls[0]).not.toHaveProperty('preferences')
    expect(calls[1].revision).toBe(0)
    await settings.save({ ...defaults, model: 'another-model' }, 1)
    expect(calls[2].revision).toBe(1); expect(calls[2].preferences.model).toBe('another-model')
  } finally { vi.unstubAllGlobals() }
})

it('迟到的刷新不能覆盖已保存的新快照', async () => {
  vi.resetModules()
  const { settings } = await import('../src/client/settings.ts')
  const stale = Promise.withResolvers<any>()
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => options?.method === 'POST'
    ? { ok: true, json: async () => ({ ...defaults, model: 'saved-model', configured: true, writable: true, revision: 1 }) }
    : stale.promise))
  try {
    const refresh = settings.refresh()
    await settings.save({ ...defaults, model: 'saved-model' }, 0)
    stale.resolve({ ok: true, json: async () => ({ ...defaults, configured: true, writable: true, revision: 0 }) })
    await refresh
    expect(settings.getSnapshot()?.revision).toBe(1)
    expect(settings.getSnapshot()?.model).toBe('saved-model')
  } finally { vi.unstubAllGlobals() }
})
