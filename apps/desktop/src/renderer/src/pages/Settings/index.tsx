import { Link } from 'react-router'
import ModelDownloadSection from '@renderer/modules/widgets/model/ModelDownloadSection'
import SummaryModelSection from '@renderer/modules/widgets/model/SummaryModelSection'
import GlossarySection from '@renderer/modules/widgets/setting/GlossarySection'
import SettingsSection from '@renderer/modules/widgets/setting/SettingsSection'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

export default function Settings() {
  return (
    <div className={styles.page}>
      <Link className={styles.back} to={PATHS.home}>
        ← 회의 목록
      </Link>
      <h1 className={styles.title}>설정</h1>
      <SettingsSection>
        <ModelDownloadSection />
        <SummaryModelSection />
        <GlossarySection />
      </SettingsSection>
    </div>
  )
}
