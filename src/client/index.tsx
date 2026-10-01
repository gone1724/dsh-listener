import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { defaults, validatePreferences, validateUpdateSource, workspaceFromHost, VERSION, type SettingsView, type UpdateSource, type UpdateProgress, type Preferences } from '../shared.ts'
import { settings } from './settings.ts'
import { HotkeyCapture, HotkeyGesture, matches, releasesBinding } from './hotkey.ts'
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
.speeker-settings{max-width:480px;padding:12px;color:inherit;font:inherit;font-size:13px}.speeker-settings h2{margin:0 0 6px;font-size:16px}.speeker-settings p{line-height:1.5;opacity:.8;margin:8px 0}.speeker-settings details{margin:10px 0;font-size:12px;opacity:.85}
.speeker-field{display:grid;grid-template-columns:135px 1fr;gap:12px;align-items:center;margin:16px 0}.speeker-field input:not([type=checkbox]),.speeker-field select{box-sizing:border-box;width:100%;padding:9px 10px;color:inherit;background:var(--dsw-alias-bg-layer-2,#8881);border:1px solid #8885;border-radius:7px;font:inherit}.speeker-field input[type=checkbox]{width:18px;height:18px;accent-color:#16a34a}
.speeker-actions{display:flex;gap:10px;margin-top:20px}.speeker-action{padding:8px 14px;border:1px solid #8885;border-radius:7px;background:transparent;color:inherit;cursor:pointer;font:inherit}.speeker-primary{background:#15803d;color:white;border-color:#15803d}.speeker-action:disabled{opacity:.5;cursor:default}
.speeker-dialog{padding:0;border:1px solid #8885;border-radius:12px;max-width:min(680px,calc(100vw - 32px));max-height:85vh;color:inherit;background:var(--dsw-alias-bg-layer-1,Canvas);overflow:auto}.speeker-dialog::backdrop{background:#0006}.speeker-dialog-close{display:flex;justify-content:flex-end;padding:12px 16px 0}
.speeker-settings .speeker-field{grid-template-columns:105px 1fr;gap:8px;margin:10px 0}.speeker-settings .speeker-field input:not([type=checkbox]),.speeker-settings .speeker-field select{padding:6px 8px;font-size:13px}.speeker-settings .speeker-action{padding:5px 10px;font-size:13px}.speeker-settings .speeker-actions{margin-top:12px}.speeker-popup{width:min(380px,calc(100vw - 48px));padding:16px;font-size:13px}.speeker-popup h2{font-size:16px;margin:0 0 10px}.speeker-popup p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}.speeker-popup-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.speeker-progress{width:100%;height:8px;accent-color:#16a34a}
.speeker-shortcut{display:flex;align-items:center;gap:8px}.speeker-shortcut input{min-width:0;flex:1}.speeker-shortcut button{flex:none}.speeker-settings .speeker-hint{font-size:12px;margin:5px 0 0}
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
    else if (result === 'empty') setNotice('')
    else if (result === 'edited') setNotice('草稿已编辑，语音已追加，请手动发送')
    else setNotice(result === 'sent' ? '已提交发送' : '语音已追加')
  }))
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  useEffect(() => { if (state.phase === 'error') setNotice(state.message) }, [state.phase, state.message])
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
      if (event.defaultPrevented || !document.hasFocus() || document.hidden || !button.current?.getClientRects().length) return
      // Shortcut capture in Settings must never start a recording.
      if ((event.target as HTMLElement)?.closest?.('[data-speeker-settings], [role="dialog"]')) return
      if (!latest.current.config?.configured || !matches(event, latest.current.config.hotkey, true)) return
      if (owner && owner !== session && owner.busy()) return
      event.preventDefault()
      if (event.repeat) return
      pressedCode = latest.current.config.hotkey
      gesture.down()
    }
    const up = (event: KeyboardEvent) => {
      if (!pressedCode || !releasesBinding(event.code, pressedCode)) return
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
      title={config?.configured ? `${label}（${config.hotkey}）${state.preview ? `：${state.preview}` : ''}；右键打开语音输入设置` : '点击配置语音输入'}
      disabled={state.phase === 'finishing' || input.phase !== 'plain'}
      onContextMenu={event => { event.preventDefault(); if (!session.busy()) setShowSettings(true) }}
      onClick={() => { if (!config?.configured) setShowSettings(true); else if (session.active()) operations.current.finish(); else operations.current.begin() }}><Mic /></button>
    {showSettings && <SettingsDialog onClose={() => setShowSettings(false)}/>}
    {(notice && !['语音已追加', '已提交发送'].includes(notice)) && <MessageDialog message={notice} onClose={() => setNotice('')} onSettings={() => { setNotice(''); setShowSettings(true) }}>
    {pending && <><p>{pending}</p><button className="speeker-action" type="button" onClick={() => {
      const result = appendTranscript(inputActions, latest.current.input, pending, false, 0)
      if (result !== 'blocked') { setPending(''); setNotice('语音已追加') }
    }}>追加识别文字</button><button className="speeker-action" type="button" onClick={() => { void (navigator.clipboard?.writeText(pending) ?? Promise.reject()).then(() => setNotice('已复制识别文字')).catch(() => setNotice('无法复制，请使用追加按钮')) }}>复制</button></>}
    </MessageDialog>}
  </div>
}

function MessageDialog({ message, onClose, onSettings, children }: { message: string; onClose: () => void; onSettings: () => void; children?: import('react').ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="speeker-dialog speeker-popup" aria-label="语音输入提示" onCancel={onClose} onClose={onClose}>
    <h2>语音输入</h2><p role="alert">{message}</p>{children}<div className="speeker-popup-actions"><button className="speeker-action" onClick={onSettings}>检查设置</button><button className="speeker-action" onClick={onClose}>关闭</button></div>
  </dialog>
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="speeker-dialog" aria-label="语音输入设置" onCancel={onClose} onClose={onClose}>
    <div className="speeker-dialog-close"><button type="button" className="speeker-action" onClick={onClose}>关闭</button></div>
    <VoiceSettings/>
  </dialog>
}

function UpdateIndicator({ progress }: { progress: UpdateProgress | null }) {
  if (!progress || progress.phase === 'idle') return null
  const percent = progress.total ? Math.min(100, progress.received / progress.total * 100) : undefined
  let value: number | undefined
  let label: string
  switch (progress.phase) {
    case 'checking': label = '正在检查版本…'; break
    case 'installing': label = '下载完成，正在安装…'; break
    case 'done': value = 100; label = '更新完成'; break
    case 'downloading':
      value = percent
      label = `已下载 ${(progress.received / 1024).toFixed(1)} KB`
      if (progress.total) label += ` / ${(progress.total / 1024).toFixed(1)} KB（${Math.floor(percent!)}%）`
      break
    default: label = '更新未完成'
  }
  return <div aria-live="polite"><progress className="speeker-progress" aria-label="更新进度" max={100} value={value}/><p>{label}</p></div>
}

function VoiceSettings() {
  const saved = useSyncExternalStore(settings.subscribe, settings.getSnapshot)
  const [form, setForm] = useState<Preferences>(defaults)
  const [key, setKey] = useState('')
  const [capture, setCapture] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [available, setAvailable] = useState(false)
  const [latestVersion, setLatestVersion] = useState('')
  const [managementMessage, setManagementMessage] = useState('')
  const [updating, setUpdating] = useState(false)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const pendingDownload = useRef<UpdateSource | null>(null)
  const dirty = useRef(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => { void settings.refresh().catch(error => setError(error.message)) }, [])
  useEffect(() => () => {
    if (pendingDownload.current) void settings.saveDownload(pendingDownload.current).catch(() => {})
  }, [])
  useEffect(() => { if (saved) { setRevision(saved.revision); if (!dirty.current) setForm({ ...saved, mirrorUrl: saved.mirrorUrl || defaults.mirrorUrl }) } }, [saved])
  useEffect(() => {
    if (!saved || busy) return
    if (form.updateSource === saved.updateSource && form.mirrorUrl === saved.mirrorUrl) {
      pendingDownload.current = null
      return
    }
    if (!saved.writable) return
    let source
    try { source = validateUpdateSource(form, false) }
    catch { pendingDownload.current = null; return }
    if (source.updateSource === saved.updateSource && source.mirrorUrl === saved.mirrorUrl) {
      pendingDownload.current = null; return
    }
    pendingDownload.current = source
    let live = true
    const timer = setTimeout(() => {
      void settings.saveDownload(source).then(() => {
        if (pendingDownload.current?.updateSource === source.updateSource && pendingDownload.current.mirrorUrl === source.mirrorUrl) pendingDownload.current = null
      }).catch(() => { if (live) setError('下载设置未保存，请刷新后重试。') })
    }, 500)
    return () => { live = false; clearTimeout(timer) }
  }, [form.updateSource, form.mirrorUrl, saved, busy])
  useEffect(() => {
    if (!updating) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try { const value = await settings.progress(AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])); if (!controller.signal.aborted) setProgress(value) }
      catch { /* Progress transport failure must not abort the installation request. */ }
      if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 700)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [updating])
  useEffect(() => {
    if (!capture) return
    const recorder = new HotkeyCapture()
    const choose = (binding: string) => {
      try { validatePreferences({ ...defaults, hotkey: binding }) }
      catch { setMessage('请选择字母、数字、空格、F1–F12 或修饰键组合'); return }
      dirty.current = true; setForm(p => ({ ...p, hotkey: binding })); setCapture(false); setMessage('快捷键已选择，点击保存生效')
    }
    const keydown = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.repeat || event.isComposing) return
      const binding = recorder.down(event)
      if (event.getModifierState('AltGraph')) { setMessage('AltGr 用于字符输入，请选择其他快捷键'); return }
      if (binding) choose(binding)
    }
    const keyup = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation()
      const binding = recorder.up(event)
      if (binding) choose(binding)
    }
    const blur = () => setCapture(false)
    window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', blur) }
  }, [capture])
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => { dirty.current = true; setForm(p => ({ ...p, [key]: value })) }
  const applySavedSettings = (value: SettingsView) => {
    dirty.current = false
    setForm(value); setRevision(value.revision); setKey('')
  }
  const saveConfiguration = () => {
    setBusy(true); setSaving(true); setMessage('')
    void settings.save(form, revision, key.trim() || undefined).then(value => {
      applySavedSettings(value); setMessage('设置已保存')
    }).catch(error => setError(error.message)).finally(() => { setBusy(false); setSaving(false) })
  }
  const resetConfiguration = () => {
    pendingDownload.current = null
    setBusy(true); setCapture(false); setMessage('')
    void settings.reset().then(value => {
      applySavedSettings(value)
      setAvailable(false); setProgress(null); setManagementMessage(''); setMessage('已清除保存的配置')
    }).catch(error => setError(error.message)).finally(() => setBusy(false))
  }
  const manage = (action: 'check' | 'update' | 'uninstall') => {
    setProgress(action === 'update' ? { phase: 'checking', received: 0 } : null); setUpdating(action === 'update')
    setBusy(true); setManagementMessage(action === 'check' ? '正在检查更新…' : action === 'update' ? '正在下载并安装新版，请等待…' : '正在卸载插件…')
    void settings.manage(action, form).then(result => {
      if (action === 'check') { setAvailable(!!result.available); setLatestVersion(result.latest ?? ''); setManagementMessage(result.available ? `发现新版 ${result.latest}` : '当前已是最新版本') }
      else { setManagementMessage(result.message ?? '操作已完成'); setAvailable(false); if (action === 'update') setProgress(p => ({ ...p, received: p?.received ?? 0, phase: 'done' })) }
    }).catch(error => { setManagementMessage(''); setProgress(null); setError(error.message) }).finally(() => { setBusy(false); setUpdating(false) })
  }
  return <section className="speeker-settings" data-speeker-settings>
    <h2>语音输入</h2><p>阿里云百炼 · 实时识别并追加到草稿</p>
    <label className="speeker-field"><span>API Key</span><input type="password" autoComplete="off" value={key} placeholder={saved?.configured ? '已配置；留空保留原密钥' : '输入百炼 API Key'} onChange={e => setKey(e.target.value)}/></label>
    <label className="speeker-field"><span>地域</span><select value={form.region} onChange={e => update('region', e.target.value as Preferences['region'])}><option value="beijing">北京</option><option value="singapore">新加坡</option></select></label>
    <label className="speeker-field"><span>Workspace ID</span><div><input aria-label="Workspace ID" aria-describedby="speeker-workspace-hint" value={form.workspaceId} placeholder="空间 ID，或粘贴完整 API Host" onChange={e => {
      const value = e.target.value.trim(), workspace = workspaceFromHost(value)
      if (workspace) { dirty.current = true; setForm(p => ({ ...p, ...workspace })); setMessage('已从 API Host 提取空间 ID 和地域，点击保存生效') }
      else update('workspaceId', value)
    }}/><p id="speeker-workspace-hint" className="speeker-hint">地域和 Workspace ID 必须与百炼密钥一致。</p></div></label>
    <label className="speeker-field"><span>识别模型</span><div><input aria-label="识别模型" aria-describedby="speeker-model-hint" value={form.model} onChange={e => update('model', e.target.value.trim())}/><p id="speeker-model-hint" className="speeker-hint">模型需支持 DashScope 流式识别协议。音频发送至百炼，不写入磁盘。</p></div></label>
    <div className="speeker-field"><span>快捷键</span><div className="speeker-shortcut"><input aria-label="快捷键" value={form.hotkey} readOnly/><button type="button" className="speeker-action" onClick={() => setCapture(!capture)}>{capture ? '请按快捷键' : '录入快捷键'}</button></div></div>
    <label className="speeker-field"><span>录音模式</span><select value={form.mode} onChange={e => update('mode', e.target.value as Preferences['mode'])}><option value="hold">长按：按下开始，松开停止</option><option value="toggle">点按：再次按下停止</option></select></label>
    <label className="speeker-field"><span>自动发送</span><input type="checkbox" checked={form.autoSend} onChange={e => update('autoSend', e.target.checked)}/></label>
    <div className="speeker-actions">
      <button className="speeker-action speeker-primary" type="button" disabled={busy || !saved?.writable} onClick={saveConfiguration}>{saving ? '保存中…' : '保存'}</button>
      <button type="button" className="speeker-action" disabled={busy || !saved?.writable} onClick={resetConfiguration}>清除已保存配置</button>
      <button type="button" className="speeker-action" disabled={busy} onClick={() => { dirty.current = false; void settings.refresh().catch(error => setError(error.message)) }}>刷新</button>
    </div>
    <p role="status">{saved && !saved.writable ? '当前 Harness 配置只读。' : message}</p>
    <details open><summary>插件管理 · v{VERSION}</summary>
      <label className="speeker-field"><span>下载来源</span><select disabled={busy || !saved?.writable} value={form.updateSource} onChange={e => { update('updateSource', e.target.value as Preferences['updateSource']); setAvailable(false); setManagementMessage('') }}><option value="official">GitHub 官方下载</option><option value="mirror">GitHub 镜像下载</option></select></label>
      {form.updateSource === 'mirror' && <><label className="speeker-field"><span>镜像网址</span><input type="url" disabled={busy || !saved?.writable} value={form.mirrorUrl} placeholder="https://你的镜像域名" onChange={e => { update('mirrorUrl', e.target.value); setAvailable(false); setManagementMessage('') }}/></label>
      </>}
      <div className="speeker-actions"><button type="button" className="speeker-action" disabled={busy} onClick={() => manage('check')}>检查更新</button>
        <button type="button" className="speeker-action" disabled={busy || !available} onClick={() => manage('update')}>{available ? `更新至 ${latestVersion}` : '更新'}</button>
        <button type="button" className="speeker-action" disabled={busy} onClick={() => manage('uninstall')}>一键卸载</button></div>
      <p role="status" aria-label="更新状态">{managementMessage}</p>
      <UpdateIndicator progress={progress}/>
    </details>
    {error && <MessageDialog message={error} onClose={() => setError('')} onSettings={() => setError('')}/>}
  </section>
}

/** Same slot registration approach as the MIT Harness experimental voice UI. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const sheet = document.createElement('style'); sheet.textContent = style; document.head.append(sheet)
    return () => sheet.remove()
  })
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'dsh-speeker', order: 90 }, VoiceButton))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'dsh-speeker', order: 25, label: () => '语音输入' }, VoiceSettings))
  ctx.effect(() => () => { for (const session of sessions) session.cancel(); sessions.clear(); owner = undefined })
  void settings.refresh().catch(() => undefined)
}
