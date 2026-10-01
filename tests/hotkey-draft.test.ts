import { describe, expect, it, vi } from 'vitest'
import { HotkeyCapture, HotkeyGesture, matches, releasesBinding, type KeyLike } from '../src/client/hotkey.ts'
import { appendTranscript } from '../src/client/draft.ts'
const key: KeyLike = { code: 'AltRight', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false, repeat: false, isComposing: false, getModifierState: () => false }
describe('快捷键', () => {
  it('Alt 不提前确认，支持 Alt+Space 和 Ctrl+Shift+V', () => {
    const capture = new HotkeyCapture()
    expect(capture.down(key)).toBeUndefined()
    expect(capture.down({ ...key, code: 'Space' })).toBe('Alt+Space')
    expect(capture.up({ ...key, altKey: false })).toBeUndefined()
    expect(capture.down({ ...key, code: 'ControlLeft', altKey: false, ctrlKey: true })).toBeUndefined()
    expect(capture.down({ ...key, code: 'ShiftLeft', altKey: false, ctrlKey: true, shiftKey: true })).toBeUndefined()
    expect(capture.down({ ...key, code: 'KeyV', altKey: false, ctrlKey: true, shiftKey: true })).toBe('Control+Shift+KeyV')
  })
  it('支持单独右 Alt 和仅由修饰键组成的组合，忽略 AltGr', () => {
    const capture = new HotkeyCapture()
    capture.down(key)
    expect(capture.up({ ...key, altKey: false })).toBe('AltRight')
    capture.down({ ...key, code: 'ControlLeft', altKey: false, ctrlKey: true })
    capture.down({ ...key, ctrlKey: true })
    expect(capture.up({ ...key, code: 'ControlLeft', ctrlKey: false })).toBe('Control+AltRight')
    capture.down(key)
    capture.down({ ...key, getModifierState: () => true })
    expect(capture.up(key)).toBeUndefined()
  })
  it('组合键匹配且松开主键或组成修饰键均结束，不响应无关按键', () => {
    expect(matches({ ...key, code: 'KeyV', altKey: false, ctrlKey: true, shiftKey: true }, 'Control+Shift+KeyV')).toBe(true)
    expect(releasesBinding('KeyV', 'Control+Shift+KeyV')).toBe(true)
    expect(releasesBinding('ControlLeft', 'Control+Shift+KeyV')).toBe(true)
    expect(releasesBinding('ShiftRight', 'Control+Shift+KeyV')).toBe(true)
    expect(releasesBinding('AltRight', 'Control+Shift+KeyV')).toBe(false)
  })
  it('只匹配右 Alt，忽略重复、输入法组合和 AltGr', () => {
    expect(matches(key, 'AltRight')).toBe(true)
    expect(matches({ ...key, code: 'AltLeft' }, 'AltRight')).toBe(false)
    expect(matches({ ...key, repeat: true }, 'AltRight')).toBe(false)
    expect(matches({ ...key, repeat: true }, 'AltRight', true)).toBe(true)
    expect(matches({ ...key, isComposing: true }, 'AltRight')).toBe(false)
    expect(matches({ ...key, getModifierState: () => true }, 'AltRight')).toBe(false)
  })
  it('长按按下立即开始，松开结束，不等阈值', () => {
    let active = false
    const start = vi.fn(() => { active = true }), finish = vi.fn(() => { active = false })
    const gesture = new HotkeyGesture({ start, finish, active: () => active }, () => 'hold')
    gesture.down(); expect(start).toHaveBeenCalledOnce(); gesture.down(); expect(start).toHaveBeenCalledOnce()
    gesture.up(); expect(finish).toHaveBeenCalledOnce(); gesture.up(); expect(finish).toHaveBeenCalledOnce()
  })
  it('点按第二次按下停止，松开不得重新启动', () => {
    let active = false
    const start = vi.fn(() => { active = true }), finish = vi.fn(() => { active = false })
    const gesture = new HotkeyGesture({ start, finish, active: () => active }, () => 'toggle')
    gesture.down(); gesture.up(); expect(active).toBe(true)
    gesture.down(); expect(active).toBe(false); gesture.up()
    expect(start).toHaveBeenCalledOnce(); expect(finish).toHaveBeenCalledOnce()
  })
  it('失焦重置按键，回来后能再次录音', () => {
    const start = vi.fn()
    const gesture = new HotkeyGesture({ start, finish: vi.fn(), active: () => false }, () => 'hold')
    gesture.down(); gesture.reset(); gesture.down(); expect(start).toHaveBeenCalledTimes(2)
  })
  it('按住时修改模式，松开仍结束本次长按录音', () => {
    let mode: 'hold' | 'toggle' = 'hold'
    const finish = vi.fn(), gesture = new HotkeyGesture({ start: vi.fn(), finish, active: () => true }, () => mode)
    gesture.down(); mode = 'toggle'; gesture.up(); expect(finish).toHaveBeenCalledOnce()
  })
})
describe('草稿追加与发送', () => {
  const current = { draft: 'hello', draftRev: 4, phase: 'plain', occurrences: [] }
  function actions() { return { insertText: vi.fn(() => true), submit: vi.fn() } }
  it('默认保留已有文字，只追加最终文本，不发送', () => {
    const a = actions(); expect(appendTranscript(a, current, 'world', false, 4)).toBe('appended')
    expect(a.insertText).toHaveBeenCalledWith(' world', { start: 5, end: 5, draftRev: 4 }); expect(a.submit).not.toHaveBeenCalled()
  })
  it('末尾引用芯片按 detect 坐标追加，不用 setDraft 重建', () => {
    const a = actions()
    appendTranscript(a, { ...current, draft: '检查@file.ts', occurrences: [{ length: 8 }] }, '结果', false, 4)
    expect(a.insertText).toHaveBeenCalledWith('结果', { start: 3, end: 3, draftRev: 4 })
  })
  it('开启自动发送时先追加，再走 Harness submit', () => {
    const a = actions(); expect(appendTranscript(a, current, 'world', true, 4)).toBe('sent')
    expect(a.submit).toHaveBeenCalledOnce()
    expect(a.insertText.mock.invocationCallOrder[0]).toBeLessThan(a.submit.mock.invocationCallOrder[0])
  })
  it('识别期间编辑过草稿，只追加并提示手动发送', () => {
    const a = actions(); expect(appendTranscript(a, current, 'world', true, 3)).toBe('edited')
    expect(a.submit).not.toHaveBeenCalled()
  })
  it('空识别、输入锁定、追加被拒绝均不得自动发送', () => {
    const a = actions()
    expect(appendTranscript(a, current, ' ', true, 4)).toBe('empty')
    expect(appendTranscript(a, { ...current, phase: 'claimed' }, 'text', true, 4)).toBe('blocked')
    a.insertText.mockReturnValue(false)
    expect(appendTranscript(a, current, 'text', true, 4)).toBe('blocked')
    expect(a.submit).not.toHaveBeenCalled()
  })
})
