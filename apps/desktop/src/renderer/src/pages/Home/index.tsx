import { Link } from 'react-router'
import TopBar from '@renderer/shared/components/primitives/layout/TopBar'
import { PATHS } from '@renderer/shared/routes/paths'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

/** 회의 목록은 사이드바가 들고 있어 홈은 빈 상태 안내만 한다 */
export default function Home() {
  const { t } = useLocale()

  return (
    <>
      <TopBar title={t.sidebar.home.topBar} />
      <div className={styles.empty}>
        <h1 className={styles.title}>{t.sidebar.home.title}</h1>
        <p className={styles.description}>{t.sidebar.home.description}</p>
        <Link className={styles.recordLink} to={PATHS.record}>
          {t.sidebar.home.startRecording}
        </Link>
      </div>
    </>
  )
}
