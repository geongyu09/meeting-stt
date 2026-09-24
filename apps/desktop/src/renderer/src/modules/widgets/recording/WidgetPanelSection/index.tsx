import { MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@meeting-stt/core/speakerCount'
import { setWidgetVisibleApi } from '@renderer/shared/api/widget'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import LevelWaveform from '@renderer/shared/components/primitives/ui/LevelWaveform'
import Stepper from '@renderer/shared/components/primitives/ui/Stepper'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'
import useRecorder from '@renderer/shared/hooks/domain/recording/useRecorder'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSpeakerCount from '@renderer/shared/hooks/domain/recording/useSpeakerCount'
import { formatClock } from '@renderer/shared/utils/formatClock'

import styles from './index.module.css'

const WAVEFORM_BAR_COUNT = 14
const MODEL_NOT_READY_MESSAGE = '메인 창에서 모델을 먼저 준비해 주세요'

/**
 * 오디오 그래프를 들고 있는 위젯 창의 화면. 메인 창을 앞으로 꺼내지 않고 녹음을 시작·정지한다
 * (references/architecture.md의 "녹음 위젯 패널").
 */
export default function WidgetPanelSection() {
  const { status } = useModelStatus()
  const { isRecording, levels, elapsedSec, speakerCount, errorMessage } = useRecordingState()
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
    if (!isModelReady) return <p className={styles.hint}>{MODEL_NOT_READY_MESSAGE}</p>

    return (
      <p className={styles.hint}>
        {isRecording ? '정지하면 메인 창에서 회의록을 만듭니다' : '회의가 시작되면 녹음을 누르세요'}
      </p>
    )
  }

  return (
    <section className={styles.section} aria-label="녹음 위젯">
      <header className={styles.header}>
        <span className={isRecording ? styles.recordingDot : styles.idleDot} aria-hidden="true" />
        <span className={isRecording ? styles.recordingTitle : styles.title}>
          {isRecording ? '녹음 중' : '대기 중'}
        </span>
        <button
          className={styles.hideButton}
          type="button"
          aria-label="위젯 숨기기"
          onClick={handleHide}
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className={styles.clock}>
        <p className={isRecording ? styles.elapsed : styles.idleElapsed}>
          {formatClock({ sec: elapsedSec })}
        </p>
        {isRecording ? (
          <LevelWaveform levels={levels} barCount={WAVEFORM_BAR_COUNT} size="sm" />
        ) : null}
      </div>
      <div className={styles.speakerCount}>
        <span className={styles.speakerCountLabel}>참석자 수</span>
        <Stepper
          value={text}
          onChange={changeText}
          min={MIN_SPEAKER_COUNT}
          max={MAX_SPEAKER_COUNT}
          label="참석자 수"
          placeholder="모름"
          isInvalid={!isValid}
        />
      </div>
      {isRecording ? (
        <Button variant="secondary" className={styles.stopButton} onClick={stop} disabled={isBusy}>
          <span className={styles.stopIcon} aria-hidden="true" />
          녹음 정지
        </Button>
      ) : (
        <Button
          variant="accent"
          className={styles.controlButton}
          onClick={start}
          disabled={isBusy || !isModelReady}
        >
          <span className={styles.startIcon} aria-hidden="true" />
          녹음 시작
        </Button>
      )}
      {renderFooter()}
    </section>
  )
}
