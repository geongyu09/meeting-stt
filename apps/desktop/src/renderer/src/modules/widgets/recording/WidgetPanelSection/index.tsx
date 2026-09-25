import { MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@meeting-stt/core/speakerCount'
import { setWidgetVisibleApi } from '@renderer/shared/api/widget'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import Stepper from '@renderer/shared/components/primitives/ui/Stepper'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'
import useRecorder from '@renderer/shared/hooks/domain/recording/useRecorder'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSpeakerCount from '@renderer/shared/hooks/domain/recording/useSpeakerCount'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatClock } from '@renderer/shared/utils/formatClock'

import styles from './index.module.css'

/**
 * 오디오 그래프를 들고 있는 위젯 창의 화면. 메인 창을 앞으로 꺼내지 않고 녹음을 시작·정지한다
 * (references/architecture.md의 "녹음 위젯 패널").
 */
export default function WidgetPanelSection() {
  const { t: messages } = useLocale()
  const t = messages.recording
  const { status } = useModelStatus()
  const { isRecording, elapsedSec, speakerCount, errorMessage } = useRecordingState()
  const isModelReady = status?.isReady ?? false
  const { isBusy, start, stop } = useRecorder({ isReady: isModelReady })
  const { text, isValid, changeText } = useSpeakerCount({ speakerCount })

  const handleHide = () => {
    setWidgetVisibleApi({ isVisible: false }).catch(() => console.error('위젯을 숨기지 못했습니다'))
  }

  const renderFooter = () => {
    if (errorMessage) {
      return (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      )
    }
    if (!isModelReady) return <p className={styles.hint}>{t.widget.modelNotReady}</p>

    return <p className={styles.hint}>{isRecording ? t.widget.stopHint : t.widget.startHint}</p>
  }

  return (
    <section className={styles.section} aria-label={t.widget.sectionLabel}>
      <header className={styles.header}>
        <span className={isRecording ? styles.recordingDot : styles.idleDot} aria-hidden="true" />
        <span className={isRecording ? styles.recordingTitle : styles.title}>
          {isRecording ? t.status.recording : t.status.idle}
        </span>
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
        <p className={isRecording ? styles.elapsed : styles.idleElapsed}>
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
          <span className={styles.stopIcon} aria-hidden="true" />
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
