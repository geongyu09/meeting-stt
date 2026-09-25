import { Link } from 'react-router'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import { PATHS } from '@renderer/shared/routes/paths'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatClock } from '@renderer/shared/utils/formatClock'

import styles from './NewRecordingButton.module.css'

/** 녹음 중이면 경과 시간과 함께 "녹음 중"으로 바뀐다. 어느 쪽이든 녹음 화면으로 간다 */
export default function NewRecordingButton() {
  const { t } = useLocale()
  const { isRecording, elapsedSec } = useRecordingState()

  if (isRecording) {
    return (
      <Link to={PATHS.record} className={styles.recording}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>{t.sidebar.newRecording.recording}</span>
        <span className={styles.elapsed}>{formatClock({ sec: elapsedSec })}</span>
      </Link>
    )
  }

  return (
    <Link to={PATHS.record} className={styles.idle}>
      <Icon name="mic" />
      <span className={styles.label}>{t.sidebar.newRecording.label}</span>
    </Link>
  )
}
