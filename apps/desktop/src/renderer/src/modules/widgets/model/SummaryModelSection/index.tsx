import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
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

  const size = formatBytes({ bytes: item.sizeBytes })

  const renderControl = () => {
    if (isDownloading) return <span className={styles.meta}>{percent}%</span>
    if (item.isInstalled) return <span className={styles.success}>설치되어 있습니다</span>

    return <Button onClick={downloadSummaryModel}>요약 모델 받기</Button>
  }

  return (
    <SettingRow
      title={
        <>
          요약 모델 <span className={styles.optional}>선택</span>
        </>
      }
      description={
        <>
          {item.isInstalled ? '설치됨' : `설치되지 않음 · ${size}`}. 받아 두면 회의 상세에서 요약을
          만들 수 있습니다. 없어도 녹음과 회의록 작성은 그대로 됩니다.
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
      {isDownloading ? <ProgressBar percent={percent} label="요약 모델 다운로드 진행률" /> : null}
    </SettingRow>
  )
}
