import type { Meeting } from '@shared/types'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatMeetingTime } from '@renderer/shared/utils/formatMeetingDate'

import type { RecordSearch } from '../types/recordSearch'
import SearchResultCard from './SearchResultCard'
import styles from './RecordTimeline.module.css'

interface RecordTimelineProps {
  /** 녹음 중 회의의 시작 시각을 찾는 데만 쓴다. 기록은 입력창 위 최근 녹음 줄에 있다 */
  meetings: Meeting[]
  /** 이 대화에서 한 기록 찾기, 한 순 */
  searches: RecordSearch[]
  /** 녹음 중인 회의. 카드 대신 "녹음을 시작했어요" 줄이다 */
  recordingMeetingId: string | null
  /** 녹음 중 회의가 아직 목록에 없을 때 쓰는 시작 시각 */
  recordingStartedAt: number
  onOpenRecord: (meetingId: string) => void
}

/** 턴 목록 뒤에 붙는 기록 찾기와 녹음 중 줄 (references/features/recording.md "채팅 창의 녹음") */
export default function RecordTimeline({
  meetings,
  searches,
  recordingMeetingId,
  recordingStartedAt,
  onOpenRecord
}: RecordTimelineProps) {
  const { t, locale } = useLocale()
  const labels = t.recording.recorder
  const recordingMeeting = meetings.find((meeting) => meeting.id === recordingMeetingId)

  return (
    <>
      {searches.map((search) => (
        <SearchResultCard
          key={`search-${search.at}`}
          query={search.query}
          onOpenRecord={onOpenRecord}
        />
      ))}
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
