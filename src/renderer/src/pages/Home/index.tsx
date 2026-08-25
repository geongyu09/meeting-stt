import { Link } from 'react-router'
import MeetingListSection from '@renderer/modules/widgets/meeting/MeetingListSection'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>회의록</h1>
        <Link className={styles.recordLink} to={PATHS.record}>
          새 회의 녹음
        </Link>
      </header>
      <MeetingListSection />
    </div>
  )
}
