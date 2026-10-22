import { useId, useState } from 'react'
import type { Meeting } from '@shared/types'
import RecordCard from '@renderer/modules/features/meeting/RecordCard'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatMeetingTime } from '@renderer/shared/utils/formatMeetingDate'

import styles from './StoppedRecordDock.module.css'

const MS_PER_SEC = 1000
const CHEVRON_SIZE = 16

interface StoppedRecordDockProps {
  meeting: Meeting
  onOpenRecord: (meetingId: string) => void
}

/**
 * 막 멈춘 녹음의 기록 카드. 녹음 카드 자리(입력창 위)를 이어받고, 멈춘 줄이 접기 버튼이다
 * (references/features/recording.md "채팅 창의 녹음" > "기록 카드")
 */
export default function StoppedRecordDock({ meeting, onOpenRecord }: StoppedRecordDockProps) {
  const { t, locale } = useLocale()
  const [isOpen, setIsOpen] = useState(true)
  const cardId = useId()
  const stoppedLine = t.recording.recorder.stoppedLine({
    time: formatMeetingTime({
      epochMs: meeting.createdAt + meeting.durationSec * MS_PER_SEC,
      locale
    })
  })

  return (
    <div className={styles.dock}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={isOpen}
        aria-controls={cardId}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={styles.label}>
          {isOpen ? stoppedLine : `${meeting.title} · ${stoppedLine}`}
        </span>
        <span className={isOpen ? styles.chevron : styles.chevronClosed}>
          <Icon name="chevronDown" size={CHEVRON_SIZE} />
        </span>
      </button>
      {isOpen ? (
        <div id={cardId} className={styles.card}>
          <RecordCard meetingId={meeting.id} onOpenFull={onOpenRecord} />
        </div>
      ) : null}
    </div>
  )
}
