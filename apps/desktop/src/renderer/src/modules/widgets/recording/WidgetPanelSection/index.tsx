import { formatTimestamp } from '@meeting-stt/core/format'
import { MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@meeting-stt/core/speakerCount'
import { setWidgetVisibleApi } from '@renderer/shared/api/widget'
import Button from '@renderer/shared/components/primitives/ui/Button'
import LevelMeter from '@renderer/shared/components/primitives/ui/LevelMeter'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'
import useRecorder from '@renderer/shared/hooks/domain/recording/useRecorder'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSpeakerCount from '@renderer/shared/hooks/domain/recording/useSpeakerCount'

import styles from './index.module.css'

const SPEAKER_COUNT_INPUT_ID = 'widget-speaker-count'
const MODEL_NOT_READY_MESSAGE = '메인 창에서 모델을 먼저 준비해 주세요'

/**
 * 오디오 그래프를 들고 있는 위젯 창의 화면. 메인 창을 앞으로 꺼내지 않고 녹음을 시작·정지한다
 * (references/architecture.md의 "녹음 위젯 패널").
 */
export default function WidgetPanelSection() {
  const { status } = useModelStatus()
  const { isRecording, level, elapsedSec, speakerCount, errorMessage } = useRecordingState()
  const isModelReady = status?.isReady ?? false
  const { isBusy, start, stop } = useRecorder({ isReady: isModelReady })
  const { text, isValid, changeText } = useSpeakerCount({ speakerCount })

  const handleHide = () => {
    setWidgetVisibleApi({ isVisible: false }).catch(() => console.error('위젯을 숨기지 못했습니다'))
  }

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <span className={isRecording ? styles.recordingDot : styles.idleDot} aria-hidden="true" />
        <span className={styles.title}>{isRecording ? '녹음 중' : '대기 중'}</span>
        <button
          className={styles.hideButton}
          type="button"
          aria-label="위젯 숨기기"
          onClick={handleHide}
        >
          ✕
        </button>
      </header>
      <p className={styles.elapsed}>{formatTimestamp({ sec: elapsedSec })}</p>
      <LevelMeter level={level} />
      <div className={styles.speakerCountContainer}>
        <label className={styles.speakerCountLabel} htmlFor={SPEAKER_COUNT_INPUT_ID}>
          참석자 수
        </label>
        <input
          id={SPEAKER_COUNT_INPUT_ID}
          className={styles.speakerCountInput}
          type="number"
          inputMode="numeric"
          min={MIN_SPEAKER_COUNT}
          max={MAX_SPEAKER_COUNT}
          step={1}
          placeholder="모름"
          value={text}
          onChange={(event) => changeText(event.target.value)}
          aria-invalid={!isValid}
        />
      </div>
      {isRecording ? (
        <Button variant="danger" onClick={stop} disabled={isBusy}>
          녹음 정지
        </Button>
      ) : (
        <Button onClick={start} disabled={isBusy || !isModelReady}>
          녹음 시작
        </Button>
      )}
      {isModelReady ? null : <p className={styles.hint}>{MODEL_NOT_READY_MESSAGE}</p>}
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  )
}
