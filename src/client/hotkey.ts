export interface KeyLike {
  code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean
  repeat: boolean; isComposing: boolean
  getModifierState(key: string): boolean
}
export function keyBinding(e: KeyLike): string {
  const modifiers: string[] = []
  if (e.ctrlKey && !e.code.startsWith('Control')) modifiers.push('Control')
  if (e.shiftKey && !e.code.startsWith('Shift')) modifiers.push('Shift')
  if (e.altKey && !e.code.startsWith('Alt')) modifiers.push('Alt')
  if (e.metaKey && !e.code.startsWith('Meta')) modifiers.push('Meta')
  return [...modifiers, e.code].join('+')
}
/** AltGr is reserved for character entry. Users on such layouts can bind another key. */
export function matches(e: KeyLike, binding: string, allowRepeat = false): boolean {
  return (allowRepeat || !e.repeat) && !e.isComposing && !e.getModifierState('AltGraph') && keyBinding(e) === binding
}
const modifierCode = /^(Control|Shift|Alt|Meta)(Left|Right)$/
/** Delay modifier-only selection until release so Alt can prefix a combination. */
export class HotkeyCapture {
  private candidate = ''
  down(e: KeyLike): string | undefined {
    if (e.repeat || e.isComposing || e.getModifierState('AltGraph')) { this.candidate = ''; return }
    this.candidate = keyBinding(e)
    if (!modifierCode.test(e.code)) { const binding = this.candidate; this.candidate = ''; return binding }
  }
  up(e: KeyLike): string | undefined {
    if (!this.candidate || !releasesBinding(e.code, this.candidate)) return
    const binding = this.candidate; this.candidate = ''; return binding
  }
}
export function releasesBinding(code: string, binding: string): boolean {
  const parts = binding.split('+')
  return parts.at(-1) === code || (modifierCode.test(code) && parts.slice(0, -1).includes(code.replace(/(Left|Right)$/, '')))
}
export class HotkeyGesture {
  private pressed = false
  private pressedMode: 'hold' | 'toggle' = 'hold'
  constructor(private action: { start(): void; finish(): void; active(): boolean }, private mode: () => 'hold' | 'toggle') {}
  down(): void {
    if (this.pressed) return
    this.pressed = true
    this.pressedMode = this.mode()
    if (this.action.active()) { if (this.pressedMode === 'toggle') this.action.finish() }
    else this.action.start()
  }
  up(): void {
    if (!this.pressed) return
    this.pressed = false
    if (this.pressedMode === 'hold' && this.action.active()) this.action.finish()
  }
  reset(): void { this.pressed = false }
}
