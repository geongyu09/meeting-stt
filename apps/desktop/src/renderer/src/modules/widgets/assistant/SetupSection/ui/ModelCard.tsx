import type { ModelDownloadProgressEvent, ModelStatusResponse } from '@shared/ipc'
import type { ModelKey, WhisperModelId } from '@shared/types'
import Button from '@renderer/shared/components/primitives/ui/Button'
import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import { formatBytes } from '@renderer/shared/utils/formatBytes'
import { planDownload } from '@renderer/shared/utils/planDownload'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { summarizeDownload } from '../utils/summarizeDownload'
import SetupCard from './SetupCard'
import styles from './ModelCard.module.css'

const MODEL_STEP = 2
/** 저사양 판정일 때 권장되는 모델. 이보다 큰 모델을 고르면 안내만 한다 (references/distribution.md 4절) */
const LOW_SPEC_MODEL_ID: WhisperModelId = 'small-q5_1'

interface ModelCardProps {
  modelStatus: ModelStatusResponse
  selectedId: WhisperModelId
  onSelect: (id: WhisperModelId) => void
  progress: Partial<Record<ModelKey, ModelDownloadProgressEvent>>
  isDownloading: boolean
  downloadError: Error | null
  isDeferred: boolean
  onDownload: () => void
  onDefer: () => void
  onUndefer: () => void
}

/** 음성 인식 모델 카드 — 받기 전(선택·받기·나중에), 받는 중(합산 한 줄), 받은 뒤, 나중에 받기로 한 상태 */
export default function ModelCard({
  modelStatus,
  selectedId,
  onSelect,
  progress,
  isDownloading,
  downloadError,
  isDeferred,
  onDownload,
  onDefer,
  onUndefer
}: ModelCardProps) {
  const { t } = useLocale()
  const labels = t.setup.model
  const { items, bytesToDownload } = planDownload({
    status: modelStatus,
    selectedId,
    whisperLabelOf: t.models.download.whisperItemLabel
  })

  if (modelStatus.isReady) {
    const current = modelStatus.whisperOptions.find(
      (option) => option.id === modelStatus.selectedWhisperModelId
    )

    return (
      <SetupCard step={MODEL_STEP} isDone title={labels.title}>
        <span>
          {labels.doneSummary({
            label: current?.label ?? modelStatus.selectedWhisperModelId,
            size: formatBytes({ bytes: current?.sizeBytes ?? 0 })
          })}
        </span>
        <span className={styles.muted}>{labels.doneDescription({ count: items.length - 1 })}</span>
      </SetupCard>
    )
  }

  if (isDeferred) {
    return (
      <SetupCard
        step={MODEL_STEP}
        isDone={false}
        title={labels.title}
        action={
          <Button variant="secondary" size="sm" onClick={onUndefer}>
            {labels.downloadNow}
          </Button>
        }
      >
        <span className={styles.muted}>{labels.deferred}</span>
      </SetupCard>
    )
  }

  const summary = summarizeDownload({ items, progress })
  const isLowSpecWarning =
    modelStatus.recommendedWhisperModelId === LOW_SPEC_MODEL_ID && selectedId !== LOW_SPEC_MODEL_ID

  return (
    <SetupCard
      step={MODEL_STEP}
      isDone={false}
      title={labels.title}
      action={<span className={styles.muted}>{labels.onlyForRecording}</span>}
    >
      <span className={styles.muted}>{labels.description}</span>
      <fieldset className={styles.options} disabled={isDownloading}>
        <legend className={styles.srOnly}>{labels.legend}</legend>
        {modelStatus.whisperOptions.map((option) => (
          <label
            key={option.id}
            className={[styles.option, option.id === selectedId ? styles.selected : ''].join(' ')}
          >
            <input
              className={styles.radio}
              type="radio"
              name="setupWhisperModel"
              value={option.id}
              checked={option.id === selectedId}
              onChange={() => onSelect(option.id)}
            />
            <span className={styles.optionLabel}>{option.label}</span>
            <small className={styles.size}>{formatBytes({ bytes: option.sizeBytes })}</small>
          </label>
        ))}
      </fieldset>
      {isLowSpecWarning ? (
        <p className={styles.warning}>{t.models.download.lowSpecWarning}</p>
      ) : null}
      {isDownloading ? (
        <div className={styles.progress}>
          <div className={styles.progressRow}>
            <span>{labels.downloading(summary)}</span>
            <span className={styles.size}>
              {formatBytes({ bytes: summary.receivedBytes })} /{' '}
              {formatBytes({ bytes: summary.totalBytes })}
            </span>
          </div>
          <ProgressBar percent={summary.percent} label={labels.progressLabel} />
          <span className={styles.muted}>{t.models.download.keepWindowOpen}</span>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button onClick={onDownload}>
            {labels.download({ size: formatBytes({ bytes: bytesToDownload }) })}
          </Button>
          <Button variant="secondary" onClick={onDefer}>
            {labels.later}
          </Button>
        </div>
      )}
      {downloadError ? (
        <p className={styles.error} role="alert">
          {downloadError.message}
        </p>
      ) : null}
    </SetupCard>
  )
}
