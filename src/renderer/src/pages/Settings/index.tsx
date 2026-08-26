import { Link } from 'react-router'
import ModelDownloadSection from '@renderer/modules/widgets/model/ModelDownloadSection'
import SummaryModelSection from '@renderer/modules/widgets/model/SummaryModelSection'
import SettingsSection from '@renderer/modules/widgets/setting/SettingsSection'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

export default function Settings() {
  return (
    <div className={styles.page}>
      <Link className={styles.back} to={PATHS.home}>
        ← 회의 목록
      </Link>
      <SettingsSection />
      <ModelDownloadSection />
      <SummaryModelSection />
    </div>
  )
}
