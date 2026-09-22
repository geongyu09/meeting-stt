import { Link } from 'react-router'
import RecorderSection from '@renderer/modules/widgets/recording/RecorderSection'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

export default function Record() {
  return (
    <div className={styles.page}>
      <Link className={styles.back} to={PATHS.home}>
        ← 회의 목록
      </Link>
      <RecorderSection />
    </div>
  )
}
