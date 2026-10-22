import { useNavigate } from 'react-router'
import RecordingFileSection from '@renderer/modules/widgets/recording/RecordingFileSection'
import TopBar from '@renderer/shared/components/primitives/layout/TopBar'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

/** 녹음 파일 관리 페이지. 설정의 "녹음·처리" 카테고리에서 들어온다 (references/features/recording.md "녹음 파일 관리") */
export default function Recordings() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const title = t.recording.files.title

  return (
    <>
      <TopBar title={title}>
        <Button
          variant="secondary"
          size="sm"
          // 설정 모달이 "녹음·처리" 카테고리로 열리게 한다. replace라야 설정을 닫을 때 이 화면으로 돌아오지 않는다 (references/features/ui.md "설정 모달")
          onClick={() =>
            navigate(PATHS.settings, { replace: true, state: { category: 'recording' } })
          }
        >
          {t.recording.files.backToSettings}
        </Button>
      </TopBar>
      <div className={styles.scroll}>
        <div className={styles.page}>
          <h1 className={styles.title}>{title}</h1>
          <RecordingFileSection />
        </div>
      </div>
    </>
  )
}
