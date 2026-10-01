import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { defaults, validatePreferences, type Preferences } from '../shared.ts'
import { settings } from './settings.ts'
import { HotkeyGesture, keyBinding, matches } from './hotkey.ts'
import { appendTranscript } from './draft.ts'
import { VoiceSession } from './session.ts'

export const inject = ['slots']
const sessions = new Set<VoiceSession>()
let owner: VoiceSession | undefined
const style = `
.speeker-button{border:0;border-radius:8px;padding:7px;display:inline-flex;align-items:center;gap:5px;color:#858585;background:transparent;cursor:pointer;font:inherit}
.speeker-button:hover{background:var(--dsw-alias-bg-layer-2,#8882)}.speeker-button:disabled{opacity:.5;cursor:default}
.speeker-button[data-recording=true]{color:#16a34a;background:#16a34a18}.speeker-button:focus-visible,.speeker-settings input:focus-visible,.speeker-settings select:focus-visible{outline:2px solid #16a34a;outline-offset:2px}
.speeker-control{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.speeker-status{font-size:12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.speeker-settings{max-width:620px;padding:20px;color:inherit;font:inherit}.speeker-settings h2{margin:0 0 8px;font-size:20px}.speeker-settings p{line-height:1.6;opacity:.8}
.speeker-field{display:grid;grid-template-columns:135px 1fr;gap:12px;align-items:center;margin:16px 0}.speeker-field input:not([type=checkbox]),.speeker-field select{box-sizing:border-box;width:100%;padding:9px 10px;color:inherit;background:var(--dsw-alias-bg-layer-2,#8881);border:1px solid #8885;border-radius:7px;font:inherit}.speeker-field input[type=checkbox]{width:18px;height:18px;accent-color:#16a34a}
.speeker-actions{display:flex;gap:10px;margin-top:20px}.speeker-action{padding:8px 14px;border:1px solid #8885;border-radius:7px;background:transparent;color:inherit;cursor:pointer;font:inherit}.speeker-primary{background:#15803d;color:white;border-color:#15803d}.speeker-action:disabled{opacity:.5;cursor:default}
.speeker-dialog{padding:0;border:1px solid #8885;border-radius:12px;max-width:min(680px,calc(100vw - 32px));max-height:85vh;color:inherit;background:var(--dsw-alias-bg-layer-1,Canvas);overflow:auto}.speeker-dialog::backdrop{background:#0006}.speeker-dialog-close{display:flex;justify-content:flex-end;padding:12px 16px 0}
@media(max-width:500px){.speeker-field{grid-template-columns:1fr;gap:6px}.speeker-settings{padding:12px}}
`
function Mic() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/></svg>
}

function VoiceButton({ sessionId, useInput, inputActions }: PropsRuntime<'conversation.input.right'>) {
  const input = useInput((value: InputState) => value)
  const config = useSyncExternalStore(settings.subscribe, settings.getSnapshot)
  const latest = useRef({ input, config, inputActions })
  latest.current = { input, config, inputActions }
  const start = useRef({ revision: 0, autoSend: false })
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const [session] = useState(() => new VoiceSession(text => {
    if (owner === session) owner = undefined
    const { input, inputActions } = latest.current
    const result = appendTranscript(inputActions, input, text, start.current.autoSend, start.current.revision)
    if (result === 'blocked') { setPending(text); setNotice('输入框暂不可编辑，识别文字已保留') }
    else if (result === 'empty') setNotice('没有识别到语音')
    else if (result === 'edited') setNotice('草稿已编辑，语音已追加，请手动发送')
    else setNotice(result === 'sent' ? '已提交发送' : '语音已追加')
  }))
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const operations = useRef({ begin: () => {}, finish: () => {} })
  operations.current = {
    begin: () => {
      const { config, input } = latest.current
      if (!config?.configured || input.phase !== 'plain' || (owner && owner !== session && owner.busy()) || session.busy()) return
      start.current = { revision: input.draftRev, autoSend: config.autoSend }
      setNotice(''); setPending(''); owner = session
      void session.start()
    },
    finish: () => { void session.finish() },
  }
  useEffect(() => {
    sessions.add(session)
    const gesture = new HotkeyGesture({ start: () => operations.current.begin(), finish: () => operations.current.finish(), active: session.active }, () => latest.current.config?.mode ?? 'hold')
    let pressedCode = ''
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && owner === session && session.busy()) { session.cancel('已取消录音'); gesture.reset(); pressedCode = ''; event.preventDefault(); return }
      if (event.defaultPrevented || !document.hasFocus() || document.hidden || !button.current?.getClientRects().length) return
      // Shortcut capture in Settings must never start a recording.
      if ((event.target as HTMLElement)?.closest?.('[data-speeker-settings], [role="dialog"]')) return
      if (!latest.current.config?.configured || !matches(event, latest.current.config.hotkey, true)) return
      if (owner && owner !== session && owner.busy()) return
      event.preventDefault()
      if (event.repeat) return
      pressedCode = event.code
      gesture.down()
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== pressedCode || !pressedCode) return
      event.preventDefault(); pressedCode = ''; gesture.up()
    }
    const cancel = () => {
      gesture.reset(); pressedCode = ''
      if (session.busy()) session.cancel('页面失去焦点，已取消录音')
      if (owner === session) owner = undefined
    }
    const visibility = () => { if (document.hidden) cancel() }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up)
      window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibility)
      session.cancel(); sessions.delete(session); if (owner === session) owner = undefined
    }
  }, [sessionId, session])
  const label = state.phase === 'recording' ? '停止录音' : state.phase === 'requesting' ? '取消麦克风请求' : state.phase === 'finishing' ? '正在识别' : '开始语音输入'
  return <div className="speeker-control">
    <button ref={button} type="button" className="speeker-button" aria-label={label} aria-pressed={session.active()} data-recording={state.phase === 'recording'}
      title={config?.configured ? `${label}（${config.hotkey}）` : '点击旁边的“语音设置”配置 API Key'}
      disabled={!config?.configured || state.phase === 'finishing' || input.phase !== 'plain'}
      onClick={() => { if (session.active()) operations.current.finish(); else operations.current.begin() }}><Mic />{state.phase === 'recording' && <span>录音中</span>}</button>
    <button type="button" className="speeker-button" aria-label="语音设置" title="配置百炼 API Key、快捷键和自动发送" disabled={session.busy()} onClick={() => setShowSettings(true)}>语音设置</button>
    {showSettings && <SettingsDialog onClose={() => setShowSettings(false)}/>}
    {session.busy() && <button className="speeker-button" type="button" onClick={() => { session.cancel('已取消录音'); if (owner === session) owner = undefined }}>取消</button>}
    <span className="speeker-status" role="status" title={state.preview}>{state.preview || state.message || notice}</span>
    {pending && <><button className="speeker-button" type="button" onClick={() => {
      const result = appendTranscript(inputActions, latest.current.input, pending, false, 0)
      if (result !== 'blocked') { setPending(''); setNotice('语音已追加') }
    }}>追加识别文字</button><button className="speeker-button" type="button" onClick={() => { void (navigator.clipboard?.writeText(pending) ?? Promise.reject()).then(() => setNotice('已复制识别文字')).catch(() => setNotice('无法复制，请使用追加按钮')) }}>复制</button></>}
  </div>
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="speeker-dialog" aria-label="云端语音输入设置" onCancel={onClose} onClose={onClose}>
    <div className="speeker-dialog-close"><button type="button" className="speeker-action" onClick={onClose}>关闭</button></div>
    <VoiceSettings/>
  </dialog>
}

function VoiceSettings() {
  const saved = useSyncExternalStore(settings.subscribe, settings.getSnapshot)
  const [form, setForm] = useState<Preferences>(defaults)
  const [key, setKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [capture, setCapture] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => { void settings.refresh().catch(error => setMessage(error.message)) }, [])
  useEffect(() => { if (saved) { setForm(saved); setRevision(saved.revision) } }, [saved])
  useEffect(() => {
    if (!capture) return
    let modifier = ''
    const choose = (binding: string) => {
      try { validatePreferences({ ...defaults, hotkey: binding }) }
      catch { setMessage('请选择字母、数字、空格、F1–F12 或修饰键组合'); return }
      setForm(p => ({ ...p, hotkey: binding })); setCapture(false); setMessage('快捷键已选择，点击保存生效')
    }
    const keydown = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.code === 'Escape') { setCapture(false); return }
      if (event.repeat || event.isComposing) return
      if (event.getModifierState('AltGraph')) { setMessage('AltGr 用于字符输入，请选择其他快捷键'); return }
      if (event.code.startsWith('Control') || event.code.startsWith('Shift') || event.code.startsWith('Meta')) { modifier = event.code; return }
      const binding = keyBinding(event)
      modifier = ''; choose(binding)
    }
    const keyup = (event: KeyboardEvent) => { if (event.code === modifier) { event.preventDefault(); event.stopImmediatePropagation(); choose(modifier) } }
    const blur = () => setCapture(false)
    window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', blur) }
  }, [capture])
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setForm(p => ({ ...p, [key]: value }))
  return <section className="speeker-settings" data-speeker-settings>
    <h2>云端语音输入</h2><p>边录音边上传至阿里云百炼，停止后将最终文字追加到会话输入框。音频不写入磁盘，云服务费用由你的百炼账户承担。</p>
    <label className="speeker-field"><span>API Key</span><input type="password" autoComplete="off" value={key} placeholder={saved?.configured ? '已配置；留空保留原密钥' : '输入百炼 API Key'} onChange={e => { setKey(e.target.value); setClearKey(false) }}/></label>
    {saved?.configured && <label className="speeker-field"><span>清除已保存密钥</span><input type="checkbox" checked={clearKey} onChange={e => { setClearKey(e.target.checked); if (e.target.checked) setKey('') }}/></label>}
    <label className="speeker-field"><span>地域</span><select value={form.region} onChange={e => update('region', e.target.value as Preferences['region'])}><option value="beijing">北京</option><option value="singapore">新加坡</option></select></label>
    <label className="speeker-field"><span>Workspace ID</span><input value={form.workspaceId} placeholder="推荐填写；留空使用传统 DashScope 域名" onChange={e => update('workspaceId', e.target.value.trim())}/></label>
    <label className="speeker-field"><span>识别模型</span><input value={form.model} onChange={e => update('model', e.target.value.trim())}/></label>
    <p>模型必须支持 DashScope run-task / finish-task 流式识别协议；其他 ASR 协议不能仅改模型名使用。</p>
    <div className="speeker-field"><span>快捷键</span><div><input aria-label="快捷键" value={form.hotkey} readOnly/><button type="button" className="speeker-action" onClick={() => setCapture(!capture)}>{capture ? '请按快捷键，Esc 取消' : '录入快捷键'}</button></div></div>
    <label className="speeker-field"><span>录音模式</span><select value={form.mode} onChange={e => update('mode', e.target.value as Preferences['mode'])}><option value="hold">长按：按下开始，松开停止</option><option value="toggle">点按：再次按下停止</option></select></label>
    <label className="speeker-field"><span>自动发送</span><input type="checkbox" checked={form.autoSend} onChange={e => update('autoSend', e.target.checked)}/></label>
    <p>自动发送默认关闭。开启后，原草稿与识别文字一起发送；录音或识别期间编辑过草稿时，仅追加并提示手动发送。右 Alt 在 AltGr 布局上会被保留用于输入字符，可改用其他键。</p>
    <div className="speeker-actions"><button className="speeker-action speeker-primary" type="button" disabled={busy || !saved?.writable} onClick={() => {
      setBusy(true); setMessage('')
      void settings.save(form, revision, key.trim() || undefined, clearKey).then(() => { setKey(''); setClearKey(false); setMessage('设置已保存') }).catch(error => setMessage(error.message)).finally(() => setBusy(false))
    }}>{busy ? '保存中…' : '保存'}</button><button type="button" className="speeker-action" disabled={busy} onClick={() => { void settings.refresh().catch(error => setMessage(error.message)) }}>刷新</button></div>
    <p role="status">{saved && !saved.writable ? '当前 Harness 配置只读。' : message}</p>
  </section>
}

/** Same slot registration approach as the MIT Harness experimental voice UI. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const sheet = document.createElement('style'); sheet.textContent = style; document.head.append(sheet)
    return () => sheet.remove()
  })
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'dsh-speeker', order: 90 }, VoiceButton))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'dsh-speeker', order: 25, label: () => '云端语音输入' }, VoiceSettings))
  ctx.effect(() => () => { for (const session of sessions) session.cancel(); sessions.clear(); owner = undefined })
  void settings.refresh().catch(() => undefined)
}
