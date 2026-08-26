import { useState } from 'react'
import type { WhisperModelId } from '@shared/types'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'
import { formatBytes } from '@renderer/shared/utils/formatBytes'

import DownloadItemList from './ui/DownloadItemList'
import ModelOption from './ui/ModelOption'
import { planDownload } from './utils/downloadPlan'
import styles from './index.module.css'

/** 저사양 판정일 때 권장되는 모델. 이보다 큰 모델을 고르면 안내만 한다 (references/distribution.md 4절) */
const LOW_SPEC_MODEL_ID: WhisperModelId = 'small-q5_1'

interface ModelDownloadSectionProps {
  /** 다운로드가 끝났을 때. 온보딩은 홈으로 이동하고, 설정은 넘기지 않는다 */
  onComplete?: () => void
}

/** 온보딩과 설정이 함께 쓰는 음성 인식 모델 선택·다운로드 (references/distribution.md 2절) */
export default function ModelDownloadSection({ onComplete }: ModelDownloadSectionProps) {
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

  if (isLoading && !status) return <p className={styles.message}>모델 상태를 확인하는 중입니다</p>
  if (!status) {
    return (
      <div className={styles.section}>
        <p className={styles.error} role="alert">
          {error?.message ?? '모델 상태를 확인하지 못했습니다'}
        </p>
        <Button variant="secondary" onClick={refetch}>
          다시 시도
        </Button>
      </div>
    )
  }

  // 처음 설정이면 권장 모델을, 이미 쓰고 있으면 현재 모델을 미리 골라 둔다
  const selectedId =
    chosenId ?? (status.isReady ? status.selectedWhisperModelId : status.recommendedWhisperModelId)
  const { items, bytesToDownload } = planDownload({ status, selectedId })
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
    if (isDownloading) return '내려받는 중'
    if (bytesToDownload > 0) return `다운로드 (${formatBytes({ bytes: bytesToDownload })})`

    return '이 모델 사용'
  }

  return (
    <section className={styles.section} aria-label="음성 인식 모델">
      <h2 className={styles.heading}>음성 인식 모델</h2>
      <p className={styles.notice}>
        네트워크는 모델을 내려받는 지금 한 번만 씁니다. 회의 녹음·회의록 작성·요약은 모두 이 컴퓨터
        안에서 이루어지며 어디에도 전송되지 않습니다.
      </p>

      <div className={styles.options} role="radiogroup" aria-label="음성 인식 모델 선택">
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
      </div>

      {isLowSpecWarning && (
        <p className={styles.warning}>
          이 컴퓨터 사양에서는 처리 시간이 오래 걸릴 수 있습니다. 권장 모델은 저사양용입니다.
        </p>
      )}

      {isDownloading && <DownloadItemList items={items} progress={progress} />}

      <div className={styles.actions}>
        <Button onClick={handleDownload} disabled={isDownloading || isAlreadyApplied}>
          {buttonLabel()}
        </Button>
        {isCompleted ? (
          <span className={styles.success}>모델이 준비되었습니다</span>
        ) : (
          isAlreadyApplied && <span className={styles.message}>현재 사용 중인 모델입니다</span>
        )}
      </div>

      {downloadError && (
        <p className={styles.error} role="alert">
          {downloadError.message}
        </p>
      )}
    </section>
  )
}
