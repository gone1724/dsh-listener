import { joinText } from '../shared.ts'
export interface DraftSnapshot {
  draft: string; draftRev: number; phase: string
  occurrences: readonly { length: number }[]
}
export interface DraftActions {
  insertText(text: string, span: { start: number; end: number; draftRev: number }): boolean
  submit(): void
}
/** InputState uses clipboard coordinates; TokenSpan counts each reference chip as one character. */
export function appendTranscript(actions: DraftActions, current: DraftSnapshot, text: string, autoSend: boolean, startRevision: number): 'sent' | 'appended' | 'edited' | 'blocked' | 'empty' {
  if (!text.trim()) return 'empty'
  if (current.phase !== 'plain') return 'blocked'
  const end = current.draft.length - current.occurrences.reduce((delta, chip) => delta + chip.length - 1, 0)
  const suffix = joinText(current.draft, text.trim()).slice(current.draft.length)
  if (!actions.insertText(suffix, { start: end, end, draftRev: current.draftRev })) return 'blocked'
  if (autoSend && startRevision === current.draftRev) { actions.submit(); return 'sent' }
  return autoSend ? 'edited' : 'appended'
}
