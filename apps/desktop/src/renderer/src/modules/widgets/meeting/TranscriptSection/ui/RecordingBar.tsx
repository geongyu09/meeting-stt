import { useState, type CSSProperties, type RefObject } from 'react'
import { Link } from 'react-router'
import { meetingAudioUrl } from '@shared/ipc'
import type { Meeting } from '@shared/types'
import { formatTimestamp } from '@meeting-stt/core/format'
import { MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@meeting-stt/core/speakerCount'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import Stepper from '@renderer/shared/components/primitives/ui/Stepper'
import { PATHS } from '@renderer/shared/routes/paths'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useAudioPlayer from '../model/useAudioPlayer'
import useRecordingExport from '../model/useRecordingExport'
import { parseSpeakerCountText } from '../utils/parseSpeakerCountText'
import styles from './RecordingBar.module.css'

// 슬라이더 한 칸. 초 단위 정수면 긴 회의에서 손잡이가 툭툭 끊겨 보인다
const SEEK_STEP_SEC = 0.1
const PERCENT_MAX = 100

interface RecordingBarProps {
  meeting: Meeting
  audioRef: RefObject<HTMLAudioElement | null>
  onReprocess: (params: { speakerCount: number | null }) => Promise<boolean>
}

/**
 * 상세 본문 최하단에 고정된 원본 녹음 바 — 커스텀 플레이어(재생·시킹)·WAV 저장·다시 인식.
 * 스크롤 영역 밖의 형제라 회의록을 내려도 창 바닥에 붙어 있다. 원본을 보관하지 않은 회의는 안내만 보인다
 * (references/architecture.md "녹음본 재생·내보내기·다시 인식"). 다시 인식은 회의록을 새로 만들므로 2단계 인라인 확인을 거친다.
 */
export default function RecordingBar({ meeting, audioRef, onReprocess }: RecordingBarProps) {
  const { t } = useLocale()
  const { recordingBar: labels } = t.transcript
  const { isExporting, isSaved, error, exportRecording } = useRecordingExport({
    meetingId: meeting.id
  })
  const { isPlaying, isLoadFailed, currentTimeSec, durationSec, toggle, seek } = useAudioPlayer({
    audioRef
  })
  const [isConfirming, setIsConfirming] = useState(false)
  const [speakerCountText, setSpeakerCountText] = useState('')
  const { speakerCount, isValid } = parseSpeakerCountText(speakerCountText)

  if (!meeting.hasAudio) {
    return (
      <section className={styles.bar} aria-label={labels.sectionLabel}>
        <p className={styles.message}>
          {labels.notKeptBefore}{' '}
          <Link className={styles.link} to={PATHS.settings}>
            {labels.notKeptLink}
          </Link>
          {labels.notKeptAfter}
        </p>
      </section>
    )
  }

  const handleOpenConfirm = () => {
    setSpeakerCountText(meeting.speakerCount === undefined ? '' : String(meeting.speakerCount))
    setIsConfirming(true)
  }

  const handleReprocess = async () => {
    if (await onReprocess({ speakerCount })) setIsConfirming(false)
  }

  const progressPercent = durationSec > 0 ? (currentTimeSec / durationSec) * PERCENT_MAX : 0

  const renderPlayer = () => {
    if (isLoadFailed) return <p className={styles.error}>{labels.loadFailed}</p>

    return (
      <div className={styles.player}>
        <button
          type="button"
          className={styles.playButton}
          aria-label={isPlaying ? labels.pause : labels.play}
          onClick={toggle}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={14} />
        </button>
        <span className={styles.time}>{formatTimestamp({ sec: currentTimeSec })}</span>
        <input
          type="range"
          className={styles.slider}
          aria-label={labels.seekLabel}
          min={0}
          max={durationSec}
          step={SEEK_STEP_SEC}
          value={currentTimeSec}
          disabled={durationSec === 0}
          // 채워진 구간 폭은 런타임 값이라 인라인 변수로 넘긴다
          style={{ '--progress': `${progressPercent}%` } as CSSProperties}
          onChange={(event) => seek(Number(event.target.value))}
        />
        <span className={styles.time}>{formatTimestamp({ sec: durationSec })}</span>
      </div>
    )
  }

  const renderConfirm = () => (
    <div className={styles.confirm} role="alert">
      <p className={styles.message}>{labels.reprocessConfirm}</p>
      <div className={styles.speakerCountRow}>
        <span className={styles.speakerCountLabel}>
          {isValid
            ? labels.speakerCountHint
            : labels.speakerCountInvalid({ min: MIN_SPEAKER_COUNT, max: MAX_SPEAKER_COUNT })}
        </span>
        <Stepper
          value={speakerCountText}
          onChange={setSpeakerCountText}
          min={MIN_SPEAKER_COUNT}
          max={MAX_SPEAKER_COUNT}
          label={labels.speakerCountLabel}
          placeholder={labels.speakerCountPlaceholder}
          isInvalid={!isValid}
        />
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" size="sm" onClick={() => setIsConfirming(false)}>
          {labels.cancel}
        </Button>
        <Button variant="danger" size="sm" disabled={!isValid} onClick={handleReprocess}>
          {labels.reprocess}
        </Button>
      </div>
    </div>
  )

  return (
    <section className={styles.bar} aria-label={labels.sectionLabel}>
      <audio ref={audioRef} preload="metadata" src={meetingAudioUrl(meeting.id)} />
      <div className={styles.row}>
        {renderPlayer()}
        {/* 확인 중에는 같은 이름의 "다시 인식" 버튼이 둘이 되지 않도록 기본 동작 버튼을 숨긴다 */}
        {isConfirming ? null : (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={isSaved ? labels.exported : labels.exportWav}
              title={isSaved ? labels.exported : labels.exportWav}
              disabled={isExporting}
              onClick={exportRecording}
            >
              <Icon name={isSaved ? 'check' : 'download'} size={14} />
            </button>
            <Button variant="secondary" size="sm" onClick={handleOpenConfirm}>
              {labels.reprocess}
            </Button>
          </div>
        )}
      </div>
      {isConfirming ? renderConfirm() : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  )
}
