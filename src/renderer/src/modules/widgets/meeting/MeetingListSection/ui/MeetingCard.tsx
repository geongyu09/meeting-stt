import { Link } from 'react-router'
import type { Meeting } from '@shared/types'
import PipelineProgress from '@renderer/modules/features/pipeline/PipelineProgress'
import Badge from '@renderer/shared/components/primitives/ui/Badge'
import { meetingDetailPath } from '@renderer/shared/routes/paths'
import { formatDuration } from '@renderer/shared/utils/formatDuration'
import { formatMeetingDate } from '@renderer/shared/utils/formatMeetingDate'

import { MEETING_STATUS_BADGE } from '../constants/status'
import styles from './MeetingCard.module.css'

interface MeetingCardProps {
  meeting: Meeting
}

export default function MeetingCard({ meeting }: MeetingCardProps) {
  const badge = MEETING_STATUS_BADGE[meeting.status]

  return (
    <Link className={styles.card} to={meetingDetailPath({ meetingId: meeting.id })}>
      <span className={styles.header}>
        <span className={styles.title}>{meeting.title}</span>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </span>
      <span className={styles.meta}>
        {formatMeetingDate({ epochMs: meeting.createdAt })} ·{' '}
        {formatDuration({ sec: meeting.durationSec })}
      </span>
      {meeting.status === 'processing' ? <PipelineProgress meetingId={meeting.id} /> : null}
      {meeting.errorMessage ? <span className={styles.error}>{meeting.errorMessage}</span> : null}
    </Link>
  )
}
