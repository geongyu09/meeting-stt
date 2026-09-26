import type { LiveTranscriptState } from '@shared/ipc'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useStickToBottom from '../model/useStickToBottom'
import styles from './LiveTranscriptView.module.css'

interface LiveTranscriptViewProps {
  liveTranscript: LiveTranscriptState
  isRecording: boolean
}

/** 들리는 말을 바로 글자로 보여 주는 보기. 확정된 줄은 진하게, 말하는 중인 구간은 옅게 이어 쓴다 */
export default function LiveTranscriptView({
  liveTranscript,
  isRecording
}: LiveTranscriptViewProps) {
  const { t: messages } = useLocale()
  const t = messages.recording.live
  const { lines, partial, errorMessage } = liveTranscript
  const lastLineId = lines.at(-1)?.id ?? 0
  const { containerRef, handleScroll } = useStickToBottom({
    contentKey: `${lastLineId}:${partial}`
  })
  const isEmpty = lines.length === 0 && !partial

  return (
    <div className={styles.container}>
      <div
        ref={containerRef}
        className={styles.scroller}
        role="log"
        aria-live="polite"
        aria-label={t.regionLabel}
        onScroll={handleScroll}
      >
        {isEmpty ? (
          <p className={styles.placeholder}>{isRecording ? t.listening : t.idle}</p>
        ) : null}
        {lines.map((line) => (
          <p key={line.id} className={styles.line}>
            {line.text}
          </p>
        ))}
        {partial ? <p className={styles.partial}>{partial}</p> : null}
      </div>
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : (
        <p className={styles.hint}>{t.hint}</p>
      )}
      <p className={styles.notice}>{t.resourceNotice}</p>
    </div>
  )
}
