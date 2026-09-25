import { useState } from 'react'
import type { WhisperModelId } from '@shared/types'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'
import { formatBytes } from '@renderer/shared/utils/formatBytes'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import DownloadItemList from './ui/DownloadItemList'
import ModelOption from './ui/ModelOption'
import { planDownload } from './utils/downloadPlan'
import styles from './index.module.css'

/** 저사양 판정일 때 권장되는 모델. 이보다 큰 모델을 고르면 안내만 한다 (references/distribution.md 4절) */
const LOW_SPEC_MODEL_ID: WhisperModelId = 'small-q5_1'

interface ModelDownloadSectionProps {
  /** 다운로드가 끝났을 때. 온보딩은 홈으로 이동하고, 설정은 넘기지 않는다 */
  onComplete?: () => void
  /** 설정에서는 현재 모델 한 행으로 접어 두고 "모델 바꾸기"로 펼친다 (references/architecture.md "화면별 구성") */
  variant?: 'onboarding' | 'setting'
}

/** 온보딩과 설정이 함께 쓰는 음성 인식 모델 선택·다운로드 (references/distribution.md 2절) */
export default function ModelDownloadSection({
  onComplete,
  variant = 'onboarding'
}: ModelDownloadSectionProps) {
  const { t } = useLocale()
  const {
    status,
    isLoading,
    error,
    refetch,
    progress,
    isDownloading,
    downloadError,
    downloadModels
  } = useModelStatus()
  const [chosenId, setChosenId] = useState<WhisperModelId | null>(null)
  const [isCompleted, setIsCompleted] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  if (isLoading && !status) return <p className={styles.message}>{t.models.status.loading}</p>
  if (!status) {
    return (
      <div className={styles.failure}>
        <p className={styles.error} role="alert">
          {error?.message ?? t.models.status.loadError}
        </p>
        <Button variant="secondary" onClick={refetch}>
          {t.models.status.retry}
        </Button>
      </div>
    )
  }

  // 처음 설정이면 권장 모델을, 이미 쓰고 있으면 현재 모델을 미리 골라 둔다
  const selectedId =
    chosenId ?? (status.isReady ? status.selectedWhisperModelId : status.recommendedWhisperModelId)
  const { items, bytesToDownload } = planDownload({
    status,
    selectedId,
    whisperLabelOf: t.models.download.whisperItemLabel
  })
  const isLowSpecWarning =
    status.recommendedWhisperModelId === LOW_SPEC_MODEL_ID && selectedId !== LOW_SPEC_MODEL_ID
  const isAlreadyApplied =
    status.isReady && selectedId === status.selectedWhisperModelId && bytesToDownload === 0

  const handleDownload = async () => {
    setIsCompleted(false)
    const isSucceeded = await downloadModels({ whisperModelId: selectedId })
    if (!isSucceeded) return

    setIsCompleted(true)
    onComplete?.()
  }

  const buttonLabel = () => {
    if (isDownloading) return t.models.download.downloading
    if (bytesToDownload > 0) {
      return t.models.download.downloadWithSize({ size: formatBytes({ bytes: bytesToDownload }) })
    }

    return t.models.download.useThisModel
  }

  const renderStatusNote = () => {
    if (isCompleted) return <span className={styles.success}>{t.models.download.ready}</span>
    if (isDownloading) {
      return <span className={styles.message}>{t.models.download.keepWindowOpen}</span>
    }
    if (isAlreadyApplied) {
      return <span className={styles.message}>{t.models.download.alreadyApplied}</span>
    }

    return <span className={styles.message}>{t.models.download.offlineNote}</span>
  }

  const picker = (
    <div className={styles.picker}>
      <fieldset className={styles.options}>
        <legend className={styles.legend}>{t.models.download.legend}</legend>
        {status.whisperOptions.map((option) => (
          <ModelOption
            key={option.id}
            option={option}
            isSelected={option.id === selectedId}
            isRecommended={option.id === status.recommendedWhisperModelId}
            isDisabled={isDownloading}
            onSelect={() => {
              setChosenId(option.id)
              setIsCompleted(false)
            }}
          />
        ))}
      </fieldset>

      {isLowSpecWarning && <p className={styles.warning}>{t.models.download.lowSpecWarning}</p>}

      <DownloadItemList items={items} progress={progress} isDownloading={isDownloading} />

      <div className={styles.actions}>
        {renderStatusNote()}
        <Button onClick={handleDownload} disabled={isDownloading || isAlreadyApplied}>
          {buttonLabel()}
        </Button>
      </div>

      {downloadError && (
        <p className={styles.error} role="alert">
          {downloadError.message}
        </p>
      )}
    </div>
  )

  if (variant === 'onboarding') {
    return (
      <section className={styles.section} aria-label={t.models.download.sectionLabel}>
        {picker}
      </section>
    )
  }

  const currentLabel =
    status.whisperOptions.find((option) => option.id === status.selectedWhisperModelId)?.label ??
    status.selectedWhisperModelId

  return (
    <SettingRow
      title={t.models.download.sectionLabel}
      description={`${currentLabel} · ${status.isReady ? t.models.download.installed : t.models.download.notInstalled}`}
      control={
        <Button
          variant="secondary"
          aria-expanded={isExpanded}
          disabled={isDownloading && isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? t.models.download.close : t.models.download.changeModel}
        </Button>
      }
    >
      {isExpanded ? picker : null}
    </SettingRow>
  )
}
