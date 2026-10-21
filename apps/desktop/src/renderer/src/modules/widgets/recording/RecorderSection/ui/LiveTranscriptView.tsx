import type { LiveTranscriptState } from '@shared/ipc'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './LiveTranscriptView.module.css'

interface LiveTranscriptViewProps {
  liveTranscript: LiveTranscriptState
}

/**
 * 들리는 말을 바로 글자로 보여 주는 보기. 최근 줄이 아래에 붙고 오래된 줄은 위로 밀려 흐려진다 —
 * 카드 높이가 고정이라 스크롤 대신 마지막 몇 줄만 보인다. 말하는 중인 구간은 흐린 글자로 이어 쓴다
 */
export default function LiveTranscriptView({ liveTranscript }: LiveTranscriptViewProps) {
  const { t: messages } = useLocale()
  const t = messages.recording.live
  const { lines, partial } = liveTranscript
  const isEmpty = lines.length === 0 && !partial

  return (
    <div className={styles.log} role="log" aria-live="polite" aria-label={t.regionLabel}>
      {isEmpty ? <p className={styles.placeholder}>{t.listening}</p> : null}
      {lines.map((line) => (
        <p key={line.id} className={styles.line}>
          {line.text}
        </p>
      ))}
      {partial ? <p className={styles.partial}>{partial}</p> : null}
    </div>
  )
}
