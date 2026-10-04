import type { AudioQualityIssue } from '@shared/audioQuality'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './AudioQualityNotice.module.css'

interface AudioQualityNoticeProps {
  issue: AudioQualityIssue
}

/**
 * 원본 녹음이 나빠 회의록이 부정확할 수 있음을 알린다. 알림이 아니라 그 회의의 사실이라 닫기 버튼이 없다
 * (references/architecture.md "녹음 품질 안내").
 */
export default function AudioQualityNotice({ issue }: AudioQualityNoticeProps) {
  const { t } = useLocale()
  const { label, [issue]: message } = t.transcript.audioQuality

  return (
    <div className={styles.notice} role="note" aria-label={label}>
      <p className={styles.title}>{message.title}</p>
      <p className={styles.detail}>{message.detail}</p>
    </div>
  )
}
