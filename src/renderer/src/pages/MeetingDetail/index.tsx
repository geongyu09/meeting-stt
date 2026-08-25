import { Link, Navigate, useParams } from 'react-router'
import TranscriptSection from '@renderer/modules/widgets/meeting/TranscriptSection'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

export default function MeetingDetail() {
  const { meetingId } = useParams()

  if (!meetingId) return <Navigate to={PATHS.home} replace />

  return (
    <div className={styles.page}>
      <Link className={styles.back} to={PATHS.home}>
        ← 회의 목록
      </Link>
      <TranscriptSection meetingId={meetingId} />
    </div>
  )
}
