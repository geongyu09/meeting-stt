import { useNavigate } from 'react-router'
import { controlRecordingApi } from '@renderer/shared/api/recording'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import { PATHS } from '@renderer/shared/routes/paths'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatClock } from '@renderer/shared/utils/formatClock'

import styles from './NewRecordingButton.module.css'

/**
 * 녹음은 채팅 창 안에서 한다 (references/features/recording.md "채팅 창의 녹음"). 대기 중이면 녹음을 시작하며 채팅으로 가고,
 * 녹음 중이면 경과 시간과 함께 "녹음 중"으로 바뀌어 채팅의 녹음 카드로 간다
 */
export default function NewRecordingButton() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { isRecording, elapsedSec } = useRecordingState()

  const handleClick = () => {
    if (!isRecording) {
      controlRecordingApi({ kind: 'start' }).catch(() =>
        console.error('녹음 시작 요청을 보내지 못했습니다')
      )
    }
    navigate(PATHS.assistant)
  }

  if (isRecording) {
    return (
      <button type="button" className={styles.recording} onClick={handleClick}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>{t.sidebar.newRecording.recording}</span>
        <span className={styles.elapsed}>{formatClock({ sec: elapsedSec })}</span>
      </button>
    )
  }

  return (
    <button type="button" className={styles.idle} onClick={handleClick}>
      <Icon name="mic" />
      <span className={styles.label}>{t.sidebar.newRecording.label}</span>
    </button>
  )
}
