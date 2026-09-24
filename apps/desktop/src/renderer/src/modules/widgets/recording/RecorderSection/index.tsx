import { useState } from 'react'
import { formatTimestamp } from '@meeting-stt/core/format'
import { MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@meeting-stt/core/speakerCount'
import { controlRecordingApi } from '@renderer/shared/api/recording'
import Button from '@renderer/shared/components/primitives/ui/Button'
import LevelMeter from '@renderer/shared/components/primitives/ui/LevelMeter'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSpeakerCount from '@renderer/shared/hooks/domain/recording/useSpeakerCount'

import styles from './index.module.css'

const SPEAKER_COUNT_INPUT_ID = 'recorder-speaker-count'
const CONTROL_ERROR_MESSAGE = '녹음 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요'

/**
 * 메인 창의 녹음 화면. 오디오 그래프는 위젯 패널이 들고 있으므로 여기서는 명령을 보내고
 * 상태를 구독만 한다 (references/architecture.md의 "녹음 위젯 패널").
 */
export default function RecorderSection() {
  const { isRecording, level, elapsedSec, speakerCount, errorMessage } = useRecordingState()
  const { text, isValid, changeText } = useSpeakerCount({ speakerCount })
  const [controlError, setControlError] = useState<string | null>(null)

  const handleControl = async (kind: 'start' | 'stop') => {
    try {
      await controlRecordingApi({ kind })
      setControlError(null)
    } catch {
      setControlError(CONTROL_ERROR_MESSAGE)
    }
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>새 회의 녹음</h2>
      <p className={styles.elapsed}>{formatTimestamp({ sec: elapsedSec })}</p>
      <LevelMeter level={level} />
      <div className={styles.speakerCountContainer}>
        <label className={styles.speakerCountLabel} htmlFor={SPEAKER_COUNT_INPUT_ID}>
          참석자 수 (선택)
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
        <p className={isValid ? styles.speakerCountHint : styles.error}>
          {isValid
            ? '말한 사람 수를 알면 적어 주세요. 비우면 자동으로 나누지만 긴 회의에서는 화자가 실제보다 많이 나올 수 있습니다'
            : `${MIN_SPEAKER_COUNT}~${MAX_SPEAKER_COUNT} 사이의 정수만 쓸 수 있습니다. 이대로 정지하면 자동으로 나눕니다`}
        </p>
      </div>
      {isRecording ? (
        <Button onClick={() => handleControl('stop')}>녹음 정지</Button>
      ) : (
        <Button variant="accent" onClick={() => handleControl('start')}>
          녹음 시작
        </Button>
      )}
      {controlError ? (
        <p className={styles.error} role="alert">
          {controlError}
        </p>
      ) : null}
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <p className={styles.hint}>
        정지하면 회의록 만들기가 시작되고 회의 상세 화면으로 이동합니다. 화면을 옮기거나 창을 닫아도
        녹음은 계속되며, 오른쪽 위젯 패널과 전역 단축키로도 시작·정지할 수 있습니다
      </p>
    </section>
  )
}
