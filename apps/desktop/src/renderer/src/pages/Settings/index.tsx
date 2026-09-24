import ModelDownloadSection from '@renderer/modules/widgets/model/ModelDownloadSection'
import SummaryModelSection from '@renderer/modules/widgets/model/SummaryModelSection'
import GlossarySection from '@renderer/modules/widgets/setting/GlossarySection'
import SettingsSection from '@renderer/modules/widgets/setting/SettingsSection'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import TopBar from '@renderer/shared/components/primitives/layout/TopBar'

import styles from './index.module.css'

export default function Settings() {
  return (
    <>
      <TopBar title="설정" />
      <div className={styles.scroll}>
        <div className={styles.page}>
          <h1 className={styles.title}>설정</h1>
          <SettingsSection>
            <SettingGroup title="모델">
              <ModelDownloadSection variant="setting" />
              <SummaryModelSection />
            </SettingGroup>
            <GlossarySection />
          </SettingsSection>
        </div>
      </div>
    </>
  )
}
