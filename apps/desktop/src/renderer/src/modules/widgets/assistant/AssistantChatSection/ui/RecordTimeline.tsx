import { Fragment } from 'react'
import type { Meeting } from '@shared/types'
import RecordCard from '@renderer/modules/features/meeting/RecordCard'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatMeetingTime } from '@renderer/shared/utils/formatMeetingDate'

import styles from './RecordTimeline.module.css'

const MS_PER_SEC = 1000

interface RecordTimelineProps {
  /** 앱을 켠 뒤 만들어진 회의, 만든 순 */
  meetings: Meeting[]
  /** 녹음 중인 회의. 카드 대신 "녹음을 시작했어요" 줄이다 */
  recordingMeetingId: string | null
  /** 녹음 중 회의가 아직 목록에 없을 때 쓰는 시작 시각 */
  recordingStartedAt: number
  /** 녹음을 막 멈춘 회의. 그 카드 위에 "녹음을 멈췄어요" 줄이 붙는다 */
  stoppedMeetingId: string | null
}

/** 턴 목록 뒤에 붙는 녹음 줄과 기록 카드 (references/features/recording.md "채팅 창의 녹음" > "기록 카드") */
export default function RecordTimeline({
  meetings,
  recordingMeetingId,
  recordingStartedAt,
  stoppedMeetingId
}: RecordTimelineProps) {
  const { t, locale } = useLocale()
  const labels = t.recording.recorder
  const recordingMeeting = meetings.find((meeting) => meeting.id === recordingMeetingId)

  return (
    <>
      {meetings.map((meeting) =>
        meeting.status === 'recording' ? null : (
          <Fragment key={meeting.id}>
            {meeting.id === stoppedMeetingId ? (
              <p className={styles.line}>
                {labels.stoppedLine({
                  time: formatMeetingTime({
                    epochMs: meeting.createdAt + meeting.durationSec * MS_PER_SEC,
                    locale
                  })
                })}
              </p>
            ) : null}
            <RecordCard meetingId={meeting.id} />
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
