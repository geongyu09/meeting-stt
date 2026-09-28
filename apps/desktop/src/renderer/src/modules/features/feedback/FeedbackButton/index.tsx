import { useState } from 'react'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { openFeedbackApi } from '@renderer/shared/api/feedback'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

/** 이슈 작성 화면을 브라우저로 열기만 한다. 제출은 사용자가 브라우저에서 한다 (references/architecture.md "피드백 보내기") */
export default function FeedbackButton() {
  const { t } = useLocale()
  const [isOpenFailed, setIsOpenFailed] = useState(false)

  const handleClick = async () => {
    setIsOpenFailed(false)
    try {
      await openFeedbackApi()
    } catch {
      setIsOpenFailed(true)
    }
  }

  return (
    <SettingRow
      title={t.settings.feedback.title}
      description={t.settings.feedback.description}
      control={
        <Button variant="secondary" onClick={handleClick}>
          {t.settings.feedback.action}
        </Button>
      }
    >
      {isOpenFailed ? (
        <p className={styles.error} role="alert">
          {t.settings.feedback.openError}
        </p>
      ) : null}
    </SettingRow>
  )
}
