import { useState } from 'react'
import { chooseAssistantFolderApi } from '@renderer/shared/api/assistant'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import useAssistantStatus from '@renderer/shared/hooks/domain/assistant/useAssistantStatus'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

const FOLDER_ICON_SIZE = 28

/**
 * 첫 화면 — 작업 폴더를 한 번도 고르지 않았을 때 채팅 대신 보이고, 폴더 고르기만 할 수 있다 (references/features/ui.md "첫 화면").
 * 고르면 `useAssistantStatus`의 모듈 캐시가 바뀌어 가드가 같은 자리에 채팅을 세운다.
 */
export default function WelcomeSection() {
  const { t } = useLocale()
  const { applyStatus } = useAssistantStatus()
  const [error, setError] = useState<string | null>(null)

  const handleChoose = async () => {
    try {
      applyStatus(await chooseAssistantFolderApi())
      setError(null)
    } catch {
      setError(t.setup.folder.chooseError)
    }
  }

  return (
    <section className={styles.section} aria-label={t.setup.welcome.title}>
      <span className={styles.iconWrapper}>
        <Icon name="folder" size={FOLDER_ICON_SIZE} />
      </span>
      <h1 className={styles.heading}>{t.setup.welcome.heading}</h1>
      <p className={styles.description}>{t.setup.folder.description}</p>
      <Button variant="accent" onClick={handleChoose}>
        {t.setup.folder.choose}
      </Button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
