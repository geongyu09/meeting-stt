import { formatTimestamp } from '@meeting-stt/core/format'
import type { ReactNode } from 'react'
import type { Meeting } from '@shared/types'
import InlineEditableText from '@renderer/shared/components/composites/InlineEditableText'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatMeetingDate } from '@renderer/shared/utils/formatMeetingDate'

import styles from './TranscriptHeader.module.css'

interface TranscriptHeaderProps {
  meeting: Meeting
  speakerCount: number
  onRenameTitle: (title: string) => void
  /** 제목과 같은 줄 오른쪽에 둘 버튼 */
  actions?: ReactNode
  className?: string
}

export default function TranscriptHeader({
  meeting,
  speakerCount,
  onRenameTitle,
  actions,
  className
}: TranscriptHeaderProps) {
  const { t, locale } = useLocale()

  return (
    <header className={className ? `${styles.header} ${className}` : styles.header}>
      <h1 className={styles.heading}>
        <InlineEditableText
          className={styles.title}
          value={meeting.title}
          ariaLabel={t.transcript.header.titleLabel}
          onCommit={onRenameTitle}
        />
      </h1>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
      <p className={styles.meta}>
        <span>{formatMeetingDate({ epochMs: meeting.createdAt, locale })}</span>
        <span aria-hidden="true">·</span>
        <span className={styles.duration}>{formatTimestamp({ sec: meeting.durationSec })}</span>
        {speakerCount ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{t.transcript.header.speakerCount({ count: speakerCount })}</span>
          </>
        ) : null}
      </p>
    </header>
  )
}
