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
