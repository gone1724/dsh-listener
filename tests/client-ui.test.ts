import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { defaults } from '../src/shared.ts'

const mocks = vi.hoisted(() => ({
  snapshot: null as any, listeners: new Set<() => void>(), final: null as any,
  save: vi.fn(), saveDownload: vi.fn(), start: vi.fn(), refresh: vi.fn(),
}))
vi.mock('../src/client/settings.ts', () => ({ settings: {
  getSnapshot: () => mocks.snapshot,
  subscribe: (fn: () => void) => { mocks.listeners.add(fn); return () => mocks.listeners.delete(fn) },
  refresh: mocks.refresh, save: mocks.save, saveDownload: mocks.saveDownload,
} }))
vi.mock('../src/client/session.ts', () => ({ VoiceSession: class {
  constructor(final: (text: string) => void) { mocks.final = final }
  getSnapshot = () => idle
  subscribe = () => () => {}
  active = () => false
  busy = () => false
  start = mocks.start
  finish = vi.fn()
  cancel = vi.fn()
} }))
const idle = { phase: 'idle', preview: '', message: '' }
let renderer: ReactTestRenderer | undefined
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); mocks.listeners.clear(); vi.clearAllMocks() })

async function components() {
  mocks.snapshot = { ...defaults, revision: 0, configured: true, writable: true }
  mocks.refresh.mockResolvedValue(mocks.snapshot)
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('document', { createElement: () => ({ remove: vi.fn() }), head: { append: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  const slots = new Map<string, any>()
  const { apply } = await import('../src/client/index.tsx')
  apply({ effect: (fn: any) => fn(), slots: { inject: (_name: string, fn: any) => fn(), register: (options: any, render: any) => slots.set(options.name, render) } } as any)
  return slots
}
const button = (label: string) => renderer!.root.findAllByType('button').find(node => node.children.join('') === label)!

it('未追加文字在关闭提示和切换会话后可恢复，并阻止下一次录音覆盖', async () => {
  const slots = await components()
  const props = { sessionId: 'pending-test', useInput: () => ({ draft: '', draftRev: 0, phase: 'plain', occurrences: [] }), inputActions: { insertText: () => false, submit: vi.fn() } }
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), props)) })
  act(() => mocks.final('不能丢失的文字'))
  act(() => button('关闭').props.onClick())
  expect(button('恢复识别文字')).toBeDefined()
  act(() => renderer!.root.findByProps({ 'aria-label': '开始语音输入' }).props.onClick())
  expect(mocks.start).not.toHaveBeenCalled()
  expect(renderer!.root.findAllByType('p').some(node => node.children.includes('不能丢失的文字'))).toBe(true)
  act(() => renderer!.unmount())
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), { ...props, sessionId: 'other-test' })) })
  expect(renderer!.root.findAllByType('button').some(node => node.children.includes('恢复识别文字'))).toBe(false)
  act(() => renderer!.unmount())
  await act(async () => { renderer = create(createElement(slots.get('conversation.input.right'), props)) })
  act(() => button('恢复识别文字').props.onClick())
  expect(renderer!.root.findAllByType('p').some(node => node.children.includes('不能丢失的文字'))).toBe(true)
  act(() => button('丢弃识别文字').props.onClick())
  act(() => renderer!.root.findByProps({ 'aria-label': '开始语音输入' }).props.onClick())
  expect(mocks.start).toHaveBeenCalledOnce()
})

it('脏表单保留基础版本号；保存时禁止继续编辑字段', async () => {
  const slots = await components()
  await act(async () => { renderer = create(createElement(slots.get('settings.plugins.tab'))) })
  act(() => renderer!.root.findByProps({ 'aria-label': '识别模型' }).props.onChange({ target: { value: 'my-model' } }))
  act(() => { mocks.snapshot = { ...mocks.snapshot, revision: 1, model: 'external-model' }; for (const fn of mocks.listeners) fn() })
  const saving = Promise.withResolvers<any>()
  mocks.save.mockReturnValue(saving.promise)
  act(() => button('保存').props.onClick())
  expect(mocks.save.mock.calls[0][1]).toBe(0)
  expect(renderer!.root.findByType('fieldset').props.disabled).toBe(true)
  await act(async () => { saving.resolve({ ...mocks.snapshot, model: 'my-model', revision: 2 }) })
  expect(renderer!.root.findByType('fieldset').props.disabled).toBe(false)
  expect(renderer!.root.findByProps({ 'aria-label': '识别模型' }).props.value).toBe('my-model')
})

it('自己的下载设置自动保存可以推进基础版本，同时保留其他未保存编辑', async () => {
  vi.useFakeTimers()
  const slots = await components()
  mocks.saveDownload.mockImplementation(async (source: any) => {
    mocks.snapshot = { ...mocks.snapshot, ...source, revision: 1 }
    for (const fn of mocks.listeners) fn()
    return mocks.snapshot
  })
  mocks.save.mockImplementation(async (form: any) => ({ ...form, revision: 2, configured: true, writable: true }))
  await act(async () => { renderer = create(createElement(slots.get('settings.plugins.tab'))) })
  act(() => renderer!.root.findByProps({ 'aria-label': '识别模型' }).props.onChange({ target: { value: 'my-model' } }))
  act(() => renderer!.root.findByProps({ id: 'listener-update-source' }).props.onChange({ target: { value: 'mirror' } }))
  await act(async () => { await vi.advanceTimersByTimeAsync(500) })
  expect(mocks.saveDownload).toHaveBeenCalledOnce()
  expect(renderer!.root.findByProps({ 'aria-label': '识别模型' }).props.value).toBe('my-model')
  await act(async () => button('保存').props.onClick())
  expect(mocks.save.mock.calls[0][1]).toBe(1)
  expect(mocks.save.mock.calls[0][0].model).toBe('my-model')
})
