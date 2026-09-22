import { Link } from 'react-router'
import UpdateBanner from '@renderer/modules/features/update/UpdateBanner'
import MeetingListSection from '@renderer/modules/widgets/meeting/MeetingListSection'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>회의록</h1>
        <nav className={styles.nav}>
          <Link className={styles.settingsLink} to={PATHS.settings}>
            설정
          </Link>
          <Link className={styles.recordLink} to={PATHS.record}>
            새 회의 녹음
          </Link>
        </nav>
      </header>
      <UpdateBanner />
      <MeetingListSection />
    </div>
  )
}
