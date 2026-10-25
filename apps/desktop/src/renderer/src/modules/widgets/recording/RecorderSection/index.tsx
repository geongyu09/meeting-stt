import { useState } from 'react'
import { MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@meeting-stt/core/speakerCount'
import PauseRecordingButton from '@renderer/modules/features/recording/PauseRecordingButton'
import RecordingTypeToggle from '@renderer/modules/features/recording/RecordingTypeToggle'
import { controlRecordingApi, setLiveTranscriptApi } from '@renderer/shared/api/recording'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import LevelWaveform from '@renderer/shared/components/primitives/ui/LevelWaveform'
import Stepper from '@renderer/shared/components/primitives/ui/Stepper'
import useRecordingNote from '@renderer/shared/hooks/domain/recording/useRecordingNote'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSpeakerCount from '@renderer/shared/hooks/domain/recording/useSpeakerCount'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatClock } from '@renderer/shared/utils/formatClock'

import LiveTranscriptView from './ui/LiveTranscriptView'
import ViewModeToggle from './ui/ViewModeToggle'
import styles from './index.module.css'

const WAVEFORM_BAR_COUNT = 40
const STOP_ICON_SIZE = 16
const NOTE_ICON_SIZE = 14
const NOTE_ROWS = 4

/**
 * 채팅 입력창 위에 붙는 녹음 카드. 녹음 중에만 그린다 (references/features/recording.md "채팅 창의 녹음" > "녹음 카드").
 * 오디오 그래프는 위젯 패널이 들고 있으므로 여기서는 명령을 보내고 상태를 구독만 한다.
 */
export default function RecorderSection() {
  const { t: messages } = useLocale()
  const t = messages.recording
  const {
    isRecording,
    isPaused,
    level,
    elapsedSec,
    speakerCount,
    recordingType,
    liveTranscript,
    systemAudio,
    note
  } = useRecordingState()
  const { text, isValid, changeText } = useSpeakerCount({ speakerCount })
  const noteField = useRecordingNote({ note })
  const [controlError, setControlError] = useState<string | null>(null)
  const [isStopping, setIsStopping] = useState(false)
  const [isNoteOpen, setIsNoteOpen] = useState(false)

  if (!isRecording) return null

  const handleViewChange = async (isLive: boolean) => {
    try {
      await setLiveTranscriptApi({ isEnabled: isLive })
      setControlError(null)
    } catch {
      setControlError(t.live.toggleError)
    }
  }

  const handleStop = async () => {
    setIsStopping(true)
    try {
      await controlRecordingApi({ kind: 'stop' })
      setControlError(null)
    } catch {
      setControlError(t.recorder.controlError)
    } finally {
      setIsStopping(false)
    }
  }

  // 메모는 화자 분리를 하지 않아 참석자 수를 묻지 않는다
  const isMemo = recordingType === 'memo'
  const error =
    controlError ??
    noteField.saveError ??
    liveTranscript.errorMessage ??
    (isValid || isMemo
      ? null
      : t.speakerCount.invalid({ min: MIN_SPEAKER_COUNT, max: MAX_SPEAKER_COUNT }))

  return (
    <section className={styles.card} aria-label={t.recorder.sectionLabel}>
      <div className={styles.header}>
        <span className={isPaused ? styles.pausedDot : styles.recordingDot} aria-hidden="true" />
        <span className={styles.status}>{isPaused ? t.status.paused : t.status.recording}</span>
        <span className={styles.elapsed} role="timer" aria-label={t.recorder.elapsed}>
          {formatClock({ sec: elapsedSec })}
        </span>
        {systemAudio.isEnabled ? <span className={styles.chip}>{t.systemAudio.badge}</span> : null}
        <div className={styles.headerControls}>
          <RecordingTypeToggle recordingType={recordingType} onError={setControlError} />
          <ViewModeToggle isLive={liveTranscript.isEnabled} onChange={handleViewChange} />
        </div>
      </div>
      <div className={styles.body}>
        {liveTranscript.isEnabled ? (
          <LiveTranscriptView liveTranscript={liveTranscript} />
        ) : (
          <LevelWaveform level={level} barCount={WAVEFORM_BAR_COUNT} />
        )}
      </div>
      <div className={styles.footer}>
        {isMemo ? null : (
          <>
            <span className={styles.speakerLabel}>{t.speakerCount.short}</span>
            <Stepper
              value={text}
              onChange={changeText}
              min={MIN_SPEAKER_COUNT}
              max={MAX_SPEAKER_COUNT}
              label={t.speakerCount.label}
              placeholder={t.speakerCount.unknown}
              isInvalid={!isValid}
            />
          </>
        )}
        <Button
          variant="secondary"
          size="sm"
          className={styles.noteButton}
          aria-expanded={isNoteOpen}
          onClick={() => setIsNoteOpen((isOpen) => !isOpen)}
        >
          <Icon name="pencil" size={NOTE_ICON_SIZE} />
          {t.note.toggle}
        </Button>
        <span className={styles.spacer} />
        <PauseRecordingButton
          isPaused={isPaused}
          className={styles.pauseButton}
          onError={setControlError}
        />
        <Button className={styles.stopButton} onClick={handleStop} disabled={isStopping}>
          <Icon name="stop" size={STOP_ICON_SIZE} />
          {t.recorder.stop}
        </Button>
      </div>
      {isNoteOpen ? (
        <textarea
          className={styles.note}
          rows={NOTE_ROWS}
          value={noteField.text}
          onChange={(event) => noteField.changeText(event.target.value)}
          onBlur={noteField.release}
          placeholder={t.note.placeholder}
          aria-label={t.note.label}
        />
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : liveTranscript.isEnabled ? (
        <p className={styles.notice}>{t.live.resourceNotice}</p>
      ) : null}
    </section>
  )
}
