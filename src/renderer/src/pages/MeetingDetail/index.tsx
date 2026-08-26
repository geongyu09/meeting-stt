import { Link, Navigate, useParams } from 'react-router'
import SummarySection from '@renderer/modules/widgets/meeting/SummarySection'
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
      {/* 같은 라우트에서 회의만 바뀌면 요약 진행 상태가 남으므로 key로 초기화한다 */}
      <SummarySection key={meetingId} meetingId={meetingId} />
      <TranscriptSection meetingId={meetingId} />
    </div>
  )
}
