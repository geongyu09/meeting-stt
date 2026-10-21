import { Fragment } from 'react'
import type { Meeting } from '@shared/types'
import RecordCard from '@renderer/modules/features/meeting/RecordCard'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatMeetingTime } from '@renderer/shared/utils/formatMeetingDate'

import type { RecordSearch } from '../types/recordSearch'
import SearchResultCard from './SearchResultCard'
import styles from './RecordTimeline.module.css'

const MS_PER_SEC = 1000

interface RecordTimelineProps {
  /** 앱을 켠 뒤 만들어진 회의, 만든 순 */
  meetings: Meeting[]
  /** 이 대화에서 한 기록 찾기, 한 순 */
  searches: RecordSearch[]
  /** 녹음 중인 회의. 카드 대신 "녹음을 시작했어요" 줄이다 */
  recordingMeetingId: string | null
  /** 녹음 중 회의가 아직 목록에 없을 때 쓰는 시작 시각 */
  recordingStartedAt: number
  /** 녹음을 막 멈춘 회의. 그 카드 위에 "녹음을 멈췄어요" 줄이 붙는다 */
  stoppedMeetingId: string | null
  onOpenRecord: (meetingId: string) => void
}

type TimelineItem = { at: number } & (
  { kind: 'record'; meeting: Meeting } | { kind: 'search'; search: RecordSearch }
)

/** 턴 목록 뒤에 시각 순으로 붙는 녹음 줄·기록 카드·기록 찾기 (references/features/recording.md "채팅 창의 녹음") */
export default function RecordTimeline({
  meetings,
  searches,
  recordingMeetingId,
  recordingStartedAt,
  stoppedMeetingId,
  onOpenRecord
}: RecordTimelineProps) {
  const { t, locale } = useLocale()
  const labels = t.recording.recorder
  const recordingMeeting = meetings.find((meeting) => meeting.id === recordingMeetingId)
  const items: TimelineItem[] = [
    ...meetings
      .filter((meeting) => meeting.status !== 'recording')
      .map((meeting) => ({ kind: 'record' as const, at: meeting.createdAt, meeting })),
    ...searches.map((search) => ({ kind: 'search' as const, at: search.at, search }))
  ].toSorted((a, b) => a.at - b.at)

  return (
    <>
      {items.map((item) =>
        item.kind === 'search' ? (
          <SearchResultCard
            key={`search-${item.search.at}`}
            query={item.search.query}
            onOpenRecord={onOpenRecord}
          />
        ) : (
          <Fragment key={item.meeting.id}>
            {item.meeting.id === stoppedMeetingId ? (
              <p className={styles.line}>
                {labels.stoppedLine({
                  time: formatMeetingTime({
                    epochMs: item.meeting.createdAt + item.meeting.durationSec * MS_PER_SEC,
                    locale
                  })
                })}
              </p>
            ) : null}
            <RecordCard meetingId={item.meeting.id} onOpenFull={onOpenRecord} />
          </Fragment>
        )
      )}
      {recordingMeetingId ? (
        <p className={styles.line}>
          {labels.startedLine({
            time: formatMeetingTime({
              epochMs: recordingMeeting?.createdAt ?? recordingStartedAt,
              locale
            })
          })}
        </p>
      ) : null}
    </>
  )
}
