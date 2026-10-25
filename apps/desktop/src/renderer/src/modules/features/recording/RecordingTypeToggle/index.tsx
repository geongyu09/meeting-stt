import type { RecordingType } from '@shared/types'
import { setRecordingTypeApi } from '@renderer/shared/api/recording'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

const RECORDING_TYPES: RecordingType[] = ['meeting', 'memo']

interface RecordingTypeToggleProps {
  recordingType: RecordingType
  /** 실패 안내를 보여 줄 자리는 화면마다 달라 부모가 정한다. 성공하면 null로 지운다 */
  onError: (message: string | null) => void
}

/**
 * 회의 / 메모 두 칸 세그먼트. 값은 main 세션이 들고 있어 두 창이 같은 값을 보고, 녹음 중에도 바꿀 수 있다
 * (references/features/assistant.md "녹음 종류 (회의 / 메모)").
 */
export default function RecordingTypeToggle({ recordingType, onError }: RecordingTypeToggleProps) {
  const { t: messages } = useLocale()
  const t = messages.recording.type

  const handleSelect = async (type: RecordingType) => {
    if (type === recordingType) return

    try {
      await setRecordingTypeApi({ type })
      onError(null)
    } catch {
      onError(t.error)
    }
  }

  return (
    <div className={styles.container} role="group" aria-label={t.label}>
      {RECORDING_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          className={type === recordingType ? styles.selected : styles.option}
          aria-pressed={type === recordingType}
          onClick={() => handleSelect(type)}
        >
          {t[type]}
        </button>
      ))}
    </div>
  )
}
