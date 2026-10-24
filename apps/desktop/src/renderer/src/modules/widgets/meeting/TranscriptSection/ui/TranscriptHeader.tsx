import { formatTimestamp } from '@meeting-stt/core/format'
import type { ReactNode, Ref } from 'react'
import type { Meeting } from '@shared/types'
import InlineEditableText from '@renderer/shared/components/composites/InlineEditableText'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatMeetingDate } from '@renderer/shared/utils/formatMeetingDate'

import styles from './TranscriptHeader.module.css'

interface TranscriptHeaderProps {
  meeting: Meeting
  speakerCount: number
  /** 제목 표시 버튼. 더보기의 "제목 수정"이 이것을 눌러 편집을 시작한다 */
  titleRef: Ref<HTMLButtonElement>
  onRenameTitle: (title: string) => void
  /** 제목 오른쪽에 둘 버튼(복사·더보기·닫기) */
  actions?: ReactNode
}

/** 패널 헤더: 왼쪽 제목(인라인 편집)과 메타, 오른쪽 버튼 */
export default function TranscriptHeader({
  meeting,
  speakerCount,
  titleRef,
  onRenameTitle,
  actions
}: TranscriptHeaderProps) {
  const { t, locale } = useLocale()

  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <h2 className={styles.heading}>
          <InlineEditableText
            ref={titleRef}
            className={styles.title}
            value={meeting.title}
            ariaLabel={t.transcript.header.titleLabel}
            onCommit={onRenameTitle}
          />
        </h2>
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
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  )
}
