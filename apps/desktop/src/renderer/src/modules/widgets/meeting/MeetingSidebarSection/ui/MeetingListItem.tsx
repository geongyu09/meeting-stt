import { NavLink } from 'react-router'
import type { Meeting } from '@shared/types'
import type { Locale } from '@shared/i18n'
import PipelineProgress from '@renderer/modules/features/pipeline/PipelineProgress'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { meetingDetailPath } from '@renderer/shared/routes/paths'
import { formatDurationShort } from '@renderer/shared/utils/formatDuration'
import { formatMeetingDay, formatMeetingTime } from '@renderer/shared/utils/formatMeetingDate'
import { meetingDateGroupOf } from '@renderer/shared/utils/meetingDateGroup'

import styles from './MeetingListItem.module.css'

interface MeetingListItemProps {
  meeting: Meeting
  now: number
}

interface WhenOfParams extends MeetingListItemProps {
  locale: Locale
}

/** 오늘 회의는 시각을, 그 전 회의는 날짜를 보여 준다 */
const whenOf = ({ meeting, now, locale }: WhenOfParams) =>
  meetingDateGroupOf({ epochMs: meeting.createdAt, now }) === 'today'
    ? formatMeetingTime({ epochMs: meeting.createdAt, locale })
    : formatMeetingDay({ epochMs: meeting.createdAt, now, locale })

export default function MeetingListItem({ meeting, now }: MeetingListItemProps) {
  const { t, locale } = useLocale()

  const renderStatus = () => {
    if (meeting.status === 'recording') {
      return <span className={styles.recording}>{t.sidebar.listItem.recording}</span>
    }
    if (meeting.status === 'processing') return <PipelineProgress meetingId={meeting.id} />
    if (meeting.status === 'error') {
      return (
        <span className={styles.error}>
          {meeting.errorMessage ?? t.sidebar.listItem.defaultError}
        </span>
      )
    }

    return (
      <span className={styles.meta}>
        {whenOf({ meeting, now, locale })} ·{' '}
        {formatDurationShort({ sec: meeting.durationSec, locale })}
      </span>
    )
  }

  return (
    <NavLink
      to={meetingDetailPath({ meetingId: meeting.id })}
      className={({ isActive }) => [styles.item, isActive ? styles.active : ''].join(' ')}
    >
      <span className={styles.title}>{meeting.title}</span>
      {renderStatus()}
    </NavLink>
  )
}
