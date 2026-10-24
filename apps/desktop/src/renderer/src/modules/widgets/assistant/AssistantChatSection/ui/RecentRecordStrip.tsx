import { useState } from 'react'
import type { Meeting } from '@shared/types'
import RecordCard from '@renderer/modules/features/meeting/RecordCard'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import useNow from '@renderer/shared/hooks/common/useNow'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatDurationShort } from '@renderer/shared/utils/formatDuration'
import { formatMeetingDay } from '@renderer/shared/utils/formatMeetingDate'

import styles from './RecentRecordStrip.module.css'

const RECENT_RECORD_COUNT = 10
/** 목록에서 뺀 기록 id를 줄바꿈으로 이어 둔다. 창마다 달라도 되는 편의 상태라 설정 DB에 두지 않는다 */
const DISMISSED_STORAGE_KEY = 'recentRecords.dismissed'
const DISMISS_ICON_SIZE = 12
const NOW_REFRESH_MS = 60_000

const readDismissedIds = () => localStorage.getItem(DISMISSED_STORAGE_KEY)?.split('\n') ?? []

interface RecentRecordStripProps {
  meetings: Meeting[]
  /** 막 멈춘 녹음. 그 기록 카드를 펼친 채로 시작한다 */
  stoppedMeetingId: string | null
  onOpenRecord: (meetingId: string) => void
  /** 기록 카드의 저장·정리된 파일 칩 */
  onOpenDocument: (path: string) => void
}

/**
 * 입력창 위 최근 녹음 줄. 항목을 누르면 기록 카드가 줄 위에 펼쳐지고, x는 목록에서만 뺀다
 * (references/features/recording.md "채팅 창의 녹음" > "최근 녹음 줄")
 */
export default function RecentRecordStrip({
  meetings,
  stoppedMeetingId,
  onOpenRecord,
  onOpenDocument
}: RecentRecordStripProps) {
  const { t, locale } = useLocale()
  const { now } = useNow({ intervalMs: NOW_REFRESH_MS })
  const [selectedId, setSelectedId] = useState(stoppedMeetingId)
  const [dismissedIds, setDismissedIds] = useState(readDismissedIds)
  const recentMeetings = meetings
    .filter((meeting) => meeting.status !== 'recording' && !dismissedIds.includes(meeting.id))
    .toSorted((a, b) => b.createdAt - a.createdAt)
    .slice(0, RECENT_RECORD_COUNT)
  const selectedMeeting = recentMeetings.find((meeting) => meeting.id === selectedId)

  if (!recentMeetings.length) return null

  const handleDismiss = (meetingId: string) => {
    const nextIds = [...dismissedIds, meetingId]
    setDismissedIds(nextIds)
    localStorage.setItem(DISMISSED_STORAGE_KEY, nextIds.join('\n'))
  }

  const metaOf = (meeting: Meeting) =>
    meeting.status === 'done'
      ? `${formatMeetingDay({ epochMs: meeting.createdAt, now, locale })} · ${formatDurationShort({ sec: meeting.durationSec, locale })}`
      : t.recording.files.status[meeting.status]

  return (
    <div className={styles.dock}>
      {selectedMeeting ? (
        <div className={styles.card}>
          {/* 회의를 바꾸면 요약·편집 상태가 따라오지 않게 다시 마운트한다 */}
          <RecordCard
            key={selectedMeeting.id}
            meetingId={selectedMeeting.id}
            onOpenFull={onOpenRecord}
            onOpenFile={onOpenDocument}
          />
        </div>
      ) : null}
      <ul className={styles.list} aria-label={t.recording.recorder.recentLabel}>
        {recentMeetings.map((meeting) => (
          <li key={meeting.id} className={styles.item}>
            <button
              type="button"
              className={styles.open}
              aria-pressed={meeting.id === selectedId}
              onClick={() => setSelectedId(meeting.id === selectedId ? null : meeting.id)}
            >
              <span className={styles.title}>{meeting.title}</span>
              <small className={styles.meta}>{metaOf(meeting)}</small>
            </button>
            <button
              type="button"
              className={styles.dismiss}
              aria-label={t.recording.recorder.dismissRecent({ title: meeting.title })}
              onClick={() => handleDismiss(meeting.id)}
            >
              <Icon name="close" size={DISMISS_ICON_SIZE} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
