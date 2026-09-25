import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'
import { formatBytes } from '@renderer/shared/utils/formatBytes'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

/**
 * 로컬 실행 방식의 요약 모델 파일. 온보딩 묶음에 없어 설정의 "요약 · 용어 초안" 카테고리에서 로컬을
 * 골랐을 때만 보이고, Claude를 쓰면 필요 없다 (references/distribution.md 1절, architecture.md "LLM 공급자").
 */
export default function SummaryModelSection() {
  const { t } = useLocale()
  const { status, isLoading, error, progress, isDownloading, downloadError, downloadSummaryModel } =
    useModelStatus()

  if (isLoading && !status) return <p className={styles.message}>{t.models.status.loading}</p>
  if (!status) {
    return (
      <p className={styles.error} role="alert">
        {error?.message ?? t.models.status.loadError}
      </p>
    )
  }

  const item = status.items.find((candidate) => candidate.key === 'summary')
  if (!item) return null

  const percent = progress.summary?.percent ?? 0

  const size = formatBytes({ bytes: item.sizeBytes })

  const renderControl = () => {
    if (isDownloading) return <span className={styles.meta}>{percent}%</span>
    if (item.isInstalled) {
      return <span className={styles.success}>{t.models.summaryModel.installedStatus}</span>
    }

    return <Button onClick={downloadSummaryModel}>{t.models.summaryModel.download}</Button>
  }

  return (
    <SettingRow
      title={
        <>
          {t.models.summaryModel.title}{' '}
          <span className={styles.optional}>{t.models.summaryModel.optional}</span>
        </>
      }
      description={
        <>
          {item.isInstalled
            ? t.models.summaryModel.installed
            : t.models.summaryModel.notInstalledWithSize({ size })}
          {t.models.summaryModel.description}
          {downloadError && (
            <span className={styles.error} role="alert">
              {' '}
              {downloadError.message}
            </span>
          )}
        </>
      }
      control={renderControl()}
    >
      {isDownloading ? (
        <ProgressBar percent={percent} label={t.models.summaryModel.progressLabel} />
      ) : null}
    </SettingRow>
  )
}
