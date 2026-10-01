import { expect, it, vi } from 'vitest'
import { defaults } from '../src/shared.ts'

it('自动保存只提交下载设置，与手动保存串行，使用最新版本号', async () => {
  vi.resetModules()
  const { settings } = await import('../src/client/settings.ts')
  let revision = 0
  const calls: any[] = []
  const fetcher = vi.fn(async (_url: string, options: any) => {
    if (options?.body) { const body = JSON.parse(options.body); calls.push(body); expect(body.revision).toBe(revision); revision++ }
    return { ok: true, json: async () => ({ ...defaults, configured: true, writable: true, revision }) }
  })
  vi.stubGlobal('fetch', fetcher)
  try {
    await settings.refresh()
    const auto = settings.saveDownload({ updateSource: 'mirror', mirrorUrl: 'https://mirror.example' })
    const manual = settings.save({ ...defaults, model: 'another-model' }, 0)
    await Promise.all([auto, manual])
    expect(calls[0]).toEqual({ updateDownload: { updateSource: 'mirror', mirrorUrl: 'https://mirror.example' }, revision: 0 })
    expect(calls[0]).not.toHaveProperty('apiKey'); expect(calls[0]).not.toHaveProperty('preferences')
    expect(calls[1].revision).toBe(1); expect(calls[1].preferences.model).toBe('another-model')
  } finally { vi.unstubAllGlobals() }
})
