import { useNavigate } from 'react-router'
import ModelDownloadSection from '@renderer/modules/widgets/model/ModelDownloadSection'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

export default function Onboarding() {
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>처음 설정</h1>
        <p className={styles.description}>
          회의록을 만들려면 음성 인식·화자 분리 모델이 필요합니다. 한 번 받아 두면 이후에는 인터넷
          연결 없이 동작합니다.
        </p>
      </header>
      <ModelDownloadSection onComplete={() => navigate(PATHS.home, { replace: true })} />
    </div>
  )
}
