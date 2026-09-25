import Button from '@renderer/shared/components/primitives/ui/Button'
import useUpdate from '@renderer/shared/hooks/domain/update/useUpdate'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

/** 새 버전 이벤트를 받았을 때만 나타난다. 내려받기·설치는 사용자가 누른다 (references/distribution.md 7절) */
export default function UpdateBanner() {
  const { t } = useLocale()
  const { version, stage, error, download, install } = useUpdate()

  if (stage === 'idle' || !version) return null

  const renderAction = () => {
    if (stage === 'downloading') return <Button disabled>{t.update.actions.downloading}</Button>
    if (stage === 'downloaded') return <Button onClick={install}>{t.update.actions.install}</Button>

    return (
      <Button onClick={download}>
        {stage === 'error' ? t.update.actions.retry : t.update.actions.download}
      </Button>
    )
  }

  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>
        {t.update.banner.available({ version })}
        {stage === 'downloaded' && t.update.banner.downloaded}
        {stage === 'error' && error && <span className={styles.error}> {error}</span>}
      </span>
      {renderAction()}
    </div>
  )
}
