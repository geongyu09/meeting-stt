import { formatTimestamp, resolveSpeakerNames } from '@shared/format'
import type { Meeting } from '@shared/types'
import useMeeting from '@renderer/shared/hooks/domain/meeting/useMeeting'
import { formatMeetingDate } from '@renderer/shared/utils/formatMeetingDate'

import UtteranceRow from './ui/UtteranceRow'
import styles from './index.module.css'

interface TranscriptSectionProps {
  meetingId: string
}

const isPending = (meeting: Meeting) =>
  meeting.status === 'recording' || meeting.status === 'processing'

export default function TranscriptSection({ meetingId }: TranscriptSectionProps) {
  const { meeting, utterances, speakers, isLoading, error } = useMeeting({ meetingId })

  if (isLoading && !meeting) return <p className={styles.message}>회의를 불러오는 중입니다</p>
  if (error) return <p className={styles.error}>{error.message}</p>
  if (!meeting) return <p className={styles.message}>회의를 찾을 수 없습니다</p>

  const speakerNames = resolveSpeakerNames({
    labels: utterances.map((utterance) => utterance.speakerLabel),
    displayNames: Object.fromEntries(speakers.map(({ label, displayName }) => [label, displayName]))
  })

  const renderBody = () => {
    if (isPending(meeting)) {
      return (
        <p className={styles.message}>
          회의록을 만들고 있습니다. 시간이 걸릴 수 있으니 잠시만 기다려 주세요
        </p>
      )
    }

    if (meeting.status === 'error') {
      return <p className={styles.error}>{meeting.errorMessage ?? '회의록을 만들지 못했습니다'}</p>
    }

    if (!utterances.length) return <p className={styles.message}>인식된 발화가 없습니다</p>

    return (
      <ul className={styles.list}>
        {utterances.map((utterance) => (
          <UtteranceRow
            key={utterance.id}
            utterance={utterance}
            speakerName={speakerNames[utterance.speakerLabel]}
          />
        ))}
      </ul>
    )
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{meeting.title}</h2>
      <p className={styles.meta}>
        {formatMeetingDate({ epochMs: meeting.createdAt })} ·{' '}
        {formatTimestamp({ sec: meeting.durationSec })}
      </p>
      {renderBody()}
    </section>
  )
}
