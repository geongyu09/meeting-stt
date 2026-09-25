import Button from '@renderer/shared/components/primitives/ui/Button'
import useUpdate from '@renderer/shared/hooks/domain/update/useUpdate'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

/**
 * 설정의 "업데이트 확인" 토글과 무관하게 사용자가 누를 때 확인한다.
 * 새 버전이 있으면 그 자리에서 받기 → 다시 시작해 설치로 이어진다 (references/distribution.md 7절)
 */
export default function UpdateCheck() {
  const { t } = useLocale()
  const { version, currentVersion, stage, error, check, download, install } = useUpdate()

  const renderMessage = () => {
    if (stage === 'checking') return t.update.check.checking
    if (stage === 'latest') return t.update.check.latest({ version: currentVersion })
    if (stage === 'downloaded' && version) return t.update.check.downloaded({ version })
    if (version) return t.update.check.available({ version })
    if (stage === 'error') return null

    return t.update.check.idle
  }

  const renderAction = () => {
    if (stage === 'checking') return <Button disabled>{t.update.actions.checking}</Button>
    if (stage === 'downloading') return <Button disabled>{t.update.actions.downloading}</Button>
    if (stage === 'downloaded') return <Button onClick={install}>{t.update.actions.install}</Button>
    if (version) {
      return (
        <Button onClick={download}>
          {stage === 'error' ? t.update.actions.retry : t.update.actions.download}
        </Button>
      )
    }

    return (
      <Button variant="secondary" onClick={check}>
        {t.update.actions.checkNow}
      </Button>
    )
  }

  return (
    <div className={styles.container} role="status">
      <span className={styles.text}>
        {renderMessage()}
        {stage === 'error' && error ? <span className={styles.error}> {error}</span> : null}
      </span>
      {renderAction()}
    </div>
  )
}
