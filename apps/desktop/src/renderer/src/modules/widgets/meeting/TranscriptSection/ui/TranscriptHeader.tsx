import { formatTimestamp } from '@meeting-stt/core/format'
import type { Meeting } from '@shared/types'
import InlineEditableText from '@renderer/shared/components/composites/InlineEditableText'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatMeetingDate } from '@renderer/shared/utils/formatMeetingDate'

import styles from './TranscriptHeader.module.css'

interface TranscriptHeaderProps {
  meeting: Meeting
  speakerCount: number
  onRenameTitle: (title: string) => void
}

export default function TranscriptHeader({
  meeting,
  speakerCount,
  onRenameTitle
}: TranscriptHeaderProps) {
  const { t, locale } = useLocale()

  return (
    <header className={styles.header}>
      <h1 className={styles.heading}>
        <InlineEditableText
          className={styles.title}
          value={meeting.title}
          ariaLabel={t.transcript.header.titleLabel}
          onCommit={onRenameTitle}
        />
      </h1>
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
