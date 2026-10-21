import { useState } from 'react'
import { MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@meeting-stt/core/speakerCount'
import PauseRecordingButton from '@renderer/modules/features/recording/PauseRecordingButton'
import { setWidgetVisibleApi } from '@renderer/shared/api/widget'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import Stepper from '@renderer/shared/components/primitives/ui/Stepper'
import useDictation from '@renderer/shared/hooks/domain/dictation/useDictation'
import useDictationRecorder from '@renderer/shared/hooks/domain/dictation/useDictationRecorder'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'
import useRecorder from '@renderer/shared/hooks/domain/recording/useRecorder'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSpeakerCount from '@renderer/shared/hooks/domain/recording/useSpeakerCount'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatClock } from '@renderer/shared/utils/formatClock'

import DictationView from './ui/DictationView'
import styles from './index.module.css'

const STOP_ICON_SIZE = 16

/**
 * 오디오 그래프를 들고 있는 위젯 창의 화면. 메인 창을 앞으로 꺼내지 않고 녹음을 시작·정지한다
 * (references/features/recording.md "녹음 위젯 패널", 외형은 "채팅 창의 녹음" > "위젯 패널 외형"). 받아쓰기 중에는 같은 창이 받아쓰기 보기로 바뀐다 —
 * 그래프 소유자가 하나여야 하므로 새 창을 만들지 않는다 ("받아쓰기").
 */
export default function WidgetPanelSection() {
  const { t: messages } = useLocale()
  const t = messages.recording
  const { status } = useModelStatus()
  const { isRecording, isPaused, elapsedSec, speakerCount, errorMessage, qualityIssue } =
    useRecordingState()
  const isModelReady = status?.isReady ?? false
  const { isBusy, start, stop } = useRecorder({ isReady: isModelReady })
  const { text, isValid, changeText } = useSpeakerCount({ speakerCount })
  const [pauseError, setPauseError] = useState<string | null>(null)
  const dictation = useDictation()
  // 명령 구독은 보기와 무관하게 살아 있어야 한다. 받아쓰기 시작 지시는 녹음 보기에서 온다
  const dictationRecorder = useDictationRecorder()
  const isCapturing = isRecording && !isPaused

  const handleHide = () => {
    setWidgetVisibleApi({ isVisible: false }).catch(() => console.error('위젯을 숨기지 못했습니다'))
  }

  if (dictation.isActive) {
    return (
      <DictationView
        phase={dictation.phase}
        elapsedSec={dictation.elapsedSec}
        level={dictation.level}
        insertMode={dictation.insertMode}
        lastInsertedText={dictation.lastInsertedText}
        errorMessage={dictation.errorMessage}
        isBusy={dictationRecorder.isBusy}
        onStop={dictationRecorder.stop}
        onHide={handleHide}
      />
    )
  }

  const renderFooter = () => {
    // 받아쓰기 시작 거절·자동 종료 안내는 idle 상태로 실려 온다. 녹음 안내보다 새 것이라 먼저 보인다
    const error = dictation.errorMessage ?? errorMessage ?? pauseError
    if (error) {
      return (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )
    }
    // 상태를 읽기 전(null)에 띄우면 모델이 있는 사용자에게도 안내가 한 번 깜빡인다
    if (status && !status.isReady) return <p className={styles.hint}>{t.widget.modelNotReady}</p>
    if (isPaused) return <p className={styles.hint}>{t.widget.pausedHint}</p>
    if (qualityIssue) {
      return (
        <p className={styles.quality} role="status">
          {t.quality[qualityIssue].widget}
        </p>
      )
    }

    return <p className={styles.hint}>{isRecording ? t.widget.stopHint : t.widget.startHint}</p>
  }

  const renderTitle = () => {
    if (!isRecording) return t.status.idle

    return isPaused ? t.status.paused : t.status.recording
  }

  return (
    <section className={styles.section} aria-label={t.widget.sectionLabel}>
      <header className={styles.header}>
        <span className={isCapturing ? styles.recordingDot : styles.idleDot} aria-hidden="true" />
        <span className={isCapturing ? styles.recordingTitle : styles.title}>{renderTitle()}</span>
        {isRecording ? (
          <PauseRecordingButton
            isPaused={isPaused}
            className={styles.iconButton}
            onError={setPauseError}
          />
        ) : null}
        <button
          className={styles.hideButton}
          type="button"
          aria-label={t.widget.hide}
          onClick={handleHide}
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className={styles.clock}>
        <p className={isCapturing ? styles.elapsed : styles.idleElapsed}>
          {formatClock({ sec: elapsedSec })}
        </p>
      </div>
      <div className={styles.speakerCount}>
        <span className={styles.speakerCountLabel}>{t.speakerCount.label}</span>
        <Stepper
          value={text}
          onChange={changeText}
          min={MIN_SPEAKER_COUNT}
          max={MAX_SPEAKER_COUNT}
          label={t.speakerCount.label}
          placeholder={t.speakerCount.unknown}
          isInvalid={!isValid}
        />
      </div>
      {isRecording ? (
        <Button variant="secondary" className={styles.stopButton} onClick={stop} disabled={isBusy}>
          <Icon name="stop" size={STOP_ICON_SIZE} />
          {t.widget.stop}
        </Button>
      ) : (
        <Button
          variant="accent"
          className={styles.controlButton}
          onClick={start}
          disabled={isBusy || !isModelReady}
        >
          <span className={styles.startIcon} aria-hidden="true" />
          {t.widget.start}
        </Button>
      )}
      {renderFooter()}
    </section>
  )
}
