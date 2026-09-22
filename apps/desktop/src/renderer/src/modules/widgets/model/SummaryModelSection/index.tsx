import Button from '@renderer/shared/components/primitives/ui/Button'
import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'
import { formatBytes } from '@renderer/shared/utils/formatBytes'

import styles from './index.module.css'

/** 요약 모델은 온보딩 묶음에 없어 설정에서 따로 받는다 (references/distribution.md 1절) */
export default function SummaryModelSection() {
  const { status, isLoading, error, progress, isDownloading, downloadError, downloadSummaryModel } =
    useModelStatus()

  if (isLoading && !status) return <p className={styles.message}>모델 상태를 확인하는 중입니다</p>
  if (!status) {
    return (
      <p className={styles.error} role="alert">
        {error?.message ?? '모델 상태를 확인하지 못했습니다'}
      </p>
    )
  }

  const item = status.items.find((candidate) => candidate.key === 'summary')
  if (!item) return null

  const percent = progress.summary?.percent ?? 0

  const renderBody = () => {
    if (isDownloading) {
      return (
        <div className={styles.pending}>
          <span className={styles.meta}>
            {formatBytes({ bytes: item.sizeBytes })} · {percent}%
          </span>
          <ProgressBar percent={percent} label="요약 모델 다운로드 진행률" />
        </div>
      )
    }

    if (item.isInstalled) return <p className={styles.success}>설치되어 있습니다</p>

    return (
      <div className={styles.actions}>
        <Button onClick={downloadSummaryModel}>
          요약 모델 다운로드 ({formatBytes({ bytes: item.sizeBytes })})
        </Button>
      </div>
    )
  }

  return (
    <section className={styles.section} aria-label="요약 모델">
      <h2 className={styles.heading}>요약 모델</h2>
      <p className={styles.hint}>
        회의록을 로컬에서 요약하려면 요약 모델이 필요합니다. 없어도 녹음과 회의록 작성은 그대로
        됩니다. 네트워크는 이 다운로드에만 씁니다.
      </p>
      {renderBody()}
      {downloadError && (
        <p className={styles.error} role="alert">
          {downloadError.message}
        </p>
      )}
    </section>
  )
}
