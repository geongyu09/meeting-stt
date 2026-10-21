import { useState } from 'react'
import type { WhisperModelId } from '@shared/types'
import { chooseAssistantFolderApi } from '@renderer/shared/api/assistant'
import { controlRecordingApi } from '@renderer/shared/api/recording'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import useAssistantStatus from '@renderer/shared/hooks/domain/assistant/useAssistantStatus'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import ModelCard from './ui/ModelCard'
import SetupCard from './ui/SetupCard'
import styles from './index.module.css'

const FOLDER_STEP = 1
/** "나중에 받기"는 창마다 달라도 되는 편의 상태라 설정 DB가 아니라 localStorage에 둔다 (features/ui.md "처음 실행") */
const MODEL_DEFERRED_STORAGE_KEY = 'assistant.setup.modelDeferred'

const readModelDeferred = () => localStorage.getItem(MODEL_DEFERRED_STORAGE_KEY) === '1'

const writeModelDeferred = (isDeferred: boolean) => {
  if (isDeferred) localStorage.setItem(MODEL_DEFERRED_STORAGE_KEY, '1')
  else localStorage.removeItem(MODEL_DEFERRED_STORAGE_KEY)
}

/**
 * 처음 실행 설정 — 작업 폴더와 음성 인식 모델을 채팅 창 안의 카드로 정한다 (features/ui.md "채팅창 리뉴얼" > "처음 실행").
 * 폴더가 없거나 모델이 없는데 미루지 않았을 때 보이고, 이 세션에서 뭔가를 끝내면 완료 상태로 남아 있다.
 */
export default function SetupSection() {
  const { t } = useLocale()
  const labels = t.setup
  const { status, applyStatus } = useAssistantStatus()
  const models = useModelStatus()
  const [isModelDeferred, setIsModelDeferred] = useState(readModelDeferred)
  const [isPinned, setIsPinned] = useState(false)
  const [chosenId, setChosenId] = useState<WhisperModelId | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const modelStatus = models.status
  if (!status || !modelStatus) return null

  const isFolderDone = status.folder !== null && status.folderProblem === null
  const isModelDone = modelStatus.isReady
  const isNeeded = !isFolderDone || (!isModelDone && !isModelDeferred)
  if (!isNeeded && !isPinned) return null

  const handleChooseFolder = async () => {
    try {
      applyStatus(await chooseAssistantFolderApi())
      setActionError(null)
      setIsPinned(true)
    } catch {
      setActionError(labels.folder.chooseError)
    }
  }

  const handleDownload = () => {
    setIsPinned(true)
    void models.downloadModels({
      whisperModelId: chosenId ?? modelStatus.recommendedWhisperModelId
    })
  }

  const handleDefer = () => {
    writeModelDeferred(true)
    setIsModelDeferred(true)
    setIsPinned(true)
  }

  const handleUndefer = () => {
    writeModelDeferred(false)
    setIsModelDeferred(false)
  }

  const handleRecord = async () => {
    try {
      await controlRecordingApi({ kind: 'start' })
      setActionError(null)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : labels.ready.recordError)
    }
  }

  const isReady = isFolderDone && (isModelDone || isModelDeferred)

  return (
    <section className={styles.section} aria-label={labels.title}>
      <p className={styles.greeting}>{labels.greeting}</p>
      <SetupCard
        step={FOLDER_STEP}
        isDone={isFolderDone}
        title={labels.folder.title}
        action={
          <Button variant="secondary" size="sm" onClick={handleChooseFolder}>
            {status.folder ? labels.folder.change : labels.folder.choose}
          </Button>
        }
      >
        <span className={styles.path}>{status.folder ?? labels.folder.none}</span>
        {status.folderProblem ? (
          <span className={styles.warning} role="status">
            {t.assistant.folderProblems[status.folderProblem]}
          </span>
        ) : null}
        <span className={styles.muted}>{labels.folder.description}</span>
      </SetupCard>
      <ModelCard
        modelStatus={modelStatus}
        selectedId={chosenId ?? modelStatus.recommendedWhisperModelId}
        onSelect={setChosenId}
        progress={models.progress}
        isDownloading={models.isDownloading}
        downloadError={models.downloadError}
        isDeferred={isModelDeferred}
        onDownload={handleDownload}
        onDefer={handleDefer}
        onUndefer={handleUndefer}
      />
      {isReady ? (
        <div className={styles.ready} role="status">
          <p className={styles.readyText}>
            {isModelDone ? labels.ready.withModel : labels.ready.withoutModel}
          </p>
          {isModelDone ? (
            <div className={styles.chips}>
              <Button variant="secondary" onClick={handleRecord}>
                <Icon name="mic" />
                {labels.ready.record}
              </Button>
            </div>
          ) : null}
        </div>
      ) : models.isDownloading ? (
        <p className={styles.muted}>{labels.askWhileDownloading}</p>
      ) : null}
      {actionError ? (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      ) : null}
    </section>
  )
}
