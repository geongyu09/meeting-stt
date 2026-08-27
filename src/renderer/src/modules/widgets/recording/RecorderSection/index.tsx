import { useState } from 'react'
import { useNavigate } from 'react-router'
import { formatTimestamp } from '@shared/format'
import { isValidSpeakerCount, MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@shared/speakerCount'
import Button from '@renderer/shared/components/primitives/ui/Button'
import LevelMeter from '@renderer/shared/components/primitives/ui/LevelMeter'
import useRecorder from '@renderer/shared/hooks/domain/recording/useRecorder'
import { meetingDetailPath } from '@renderer/shared/routes/paths'

import styles from './index.module.css'

const SPEAKER_COUNT_INPUT_ID = 'recorder-speaker-count'

/** 빈 입력은 "모름"(임계값 폴백), 그 외는 정수 범위 검사를 통과해야 넘긴다 */
const parseSpeakerCount = (text: string) => {
  if (text.trim() === '') return { speakerCount: undefined, isValid: true }

  const value = Number(text)

  return { speakerCount: value, isValid: isValidSpeakerCount(value) }
}

export default function RecorderSection() {
  const navigate = useNavigate()
  const { isRecording, isBusy, level, elapsedSec, error, start, stop } = useRecorder()
  const [speakerCountText, setSpeakerCountText] = useState('')
  const { speakerCount, isValid: isSpeakerCountValid } = parseSpeakerCount(speakerCountText)

  const handleStop = async () => {
    // 범위 밖 값은 정지를 막지 않고 "모름"으로 처리한다. 녹음을 못 멈추는 상황이 더 나쁘다
    const meeting = await stop({ speakerCount: isSpeakerCountValid ? speakerCount : undefined })
    if (meeting) navigate(meetingDetailPath({ meetingId: meeting.id }))
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
          value={speakerCountText}
          onChange={(event) => setSpeakerCountText(event.target.value)}
          aria-invalid={!isSpeakerCountValid}
        />
        <p className={isSpeakerCountValid ? styles.speakerCountHint : styles.error}>
          {isSpeakerCountValid
            ? '말한 사람 수를 알면 적어 주세요. 비우면 자동으로 나누지만 긴 회의에서는 화자가 실제보다 많이 나올 수 있습니다'
            : `${MIN_SPEAKER_COUNT}~${MAX_SPEAKER_COUNT} 사이의 정수만 쓸 수 있습니다. 이대로 정지하면 자동으로 나눕니다`}
        </p>
      </div>
      {isRecording ? (
        <Button variant="danger" onClick={handleStop} disabled={isBusy}>
          녹음 정지
        </Button>
      ) : (
        <Button onClick={start} disabled={isBusy}>
          녹음 시작
        </Button>
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
      <p className={styles.hint}>
        정지하면 회의록 만들기가 시작되고 회의 상세 화면으로 이동합니다. 인터넷 연결은 쓰지 않습니다
      </p>
    </section>
  )
}
