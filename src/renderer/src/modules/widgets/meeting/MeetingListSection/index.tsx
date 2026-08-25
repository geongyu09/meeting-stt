import useMeetings from '@renderer/shared/hooks/domain/meeting/useMeetings'

import ErrorFallback from './ui/ErrorFallback'
import MeetingCard from './ui/MeetingCard'
import styles from './index.module.css'

export default function MeetingListSection() {
  const { meetings, isLoading, error, refetch } = useMeetings()

  const renderBody = () => {
    if (isLoading) return <p className={styles.message}>회의 목록을 불러오는 중입니다</p>
    if (error) return <ErrorFallback message={error.message} onRetry={refetch} />
    if (!meetings.length) {
      return <p className={styles.message}>아직 녹음한 회의가 없습니다. 새 회의를 녹음해 보세요</p>
    }

    return (
      <ul className={styles.list}>
        {meetings.map((meeting) => (
          <li key={meeting.id}>
            <MeetingCard meeting={meeting} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>회의 목록</h2>
      {renderBody()}
    </section>
  )
}
