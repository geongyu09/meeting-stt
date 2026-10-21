import { useState } from 'react'
import { setRecordingNoteApi } from '@renderer/shared/api/recording'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface UseRecordingNoteParams {
  /** main 세션이 보관 중인 노트 */
  note: string
}

/**
 * 녹음 노트 입력. 값의 출처는 main 세션 하나지만 입력 중에는 내 초안이 이긴다 — 키를 빨리 치면 직전 키의 push가
 * 늦게 도착해 칸을 되돌리므로, 포커스가 있는 동안은 초안을 보여 주고 포커스를 잃으면 세션 값으로 돌아간다
 * (references/features/recording.md "녹음 노트" > "저장과 단일 출처").
 */
const useRecordingNote = ({ note }: UseRecordingNoteParams) => {
  const { t } = useLocale()
  const [draft, setDraft] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const changeText = (next: string) => {
    setDraft(next)
    setSaveError(null)
    setRecordingNoteApi({ note: next }).catch(() => setSaveError(t.recording.note.saveError))
  }

  const release = () => setDraft(null)

  return { text: draft ?? note, saveError, changeText, release }
}

export default useRecordingNote
