import { useState } from 'react'
import { MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@meeting-stt/core/speakerCount'
import { formatAccelerator } from '@shared/shortcut'
import ImportAudioButton from '@renderer/modules/features/meeting/ImportAudioButton'
import { controlRecordingApi, setLiveTranscriptApi } from '@renderer/shared/api/recording'
import Button from '@renderer/shared/components/primitives/ui/Button'
import LevelWaveform from '@renderer/shared/components/primitives/ui/LevelWaveform'
import Stepper from '@renderer/shared/components/primitives/ui/Stepper'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSpeakerCount from '@renderer/shared/hooks/domain/recording/useSpeakerCount'
import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatClock } from '@renderer/shared/utils/formatClock'

import LiveTranscriptView from './ui/LiveTranscriptView'
import ViewModeToggle from './ui/ViewModeToggle'
import styles from './index.module.css'

const WAVEFORM_BAR_COUNT = 48

/**
 * 메인 창의 녹음 화면. 오디오 그래프는 위젯 패널이 들고 있으므로 여기서는 명령을 보내고
 * 상태를 구독만 한다 (references/architecture.md의 "녹음 위젯 패널").
 */
export default function RecorderSection() {
  const { t: messages } = useLocale()
  const t = messages.recording
  const { isRecording, levels, elapsedSec, speakerCount, errorMessage, liveTranscript } =
    useRecordingState()
  const { text, isValid, changeText } = useSpeakerCount({ speakerCount })
  const { settings } = useSettings()
  const [controlError, setControlError] = useState<string | null>(null)

  const handleViewChange = async (isLive: boolean) => {
    try {
      await setLiveTranscriptApi({ isEnabled: isLive })
      setControlError(null)
    } catch {
      setControlError(t.live.toggleError)
    }
  }

  const handleControl = async (kind: 'start' | 'stop') => {
    try {
      await controlRecordingApi({ kind })
      setControlError(null)
    } catch {
      setControlError(t.recorder.controlError)
    }
  }

  return (
    <section className={styles.section} aria-label={t.recorder.sectionLabel}>
      <div className={styles.clock}>
        <span className={isRecording ? styles.recordingStatus : styles.idleStatus}>
          <span className={styles.dot} aria-hidden="true" />
          {isRecording ? t.status.recording : t.status.idle}
        </span>
        <p className={styles.elapsed}>{formatClock({ sec: elapsedSec })}</p>
      </div>

      <div className={styles.display}>
        <ViewModeToggle isLive={liveTranscript.isEnabled} onChange={handleViewChange} />
        {liveTranscript.isEnabled ? (
          <LiveTranscriptView liveTranscript={liveTranscript} isRecording={isRecording} />
        ) : (
          <LevelWaveform levels={levels} barCount={WAVEFORM_BAR_COUNT} />
        )}
      </div>

      <div className={styles.speakerCount}>
        <div className={styles.speakerCountText}>
          <span className={styles.speakerCountTitle}>{t.speakerCount.label}</span>
          <span className={isValid ? styles.speakerCountHint : styles.error}>
            {isValid
              ? t.speakerCount.hint
              : t.speakerCount.invalid({ min: MIN_SPEAKER_COUNT, max: MAX_SPEAKER_COUNT })}
          </span>
        </div>
        <Stepper
          value={text}
          onChange={changeText}
          min={MIN_SPEAKER_COUNT}
          max={MAX_SPEAKER_COUNT}
          label={t.speakerCount.label}
          placeholder={t.speakerCount.unknown}
          isInvalid={!isValid}
        />
        <Button variant="secondary" disabled={!text} onClick={() => changeText('')}>
          {t.speakerCount.unknown}
        </Button>
      </div>

      <div className={styles.controls}>
        {isRecording ? (
          <Button className={styles.controlButton} onClick={() => handleControl('stop')}>
            <span className={styles.stopIcon} aria-hidden="true" />
            {t.recorder.stopAndTranscribe}
          </Button>
        ) : (
          <Button
            variant="accent"
            className={styles.controlButton}
            onClick={() => handleControl('start')}
          >
            <span className={styles.startIcon} aria-hidden="true" />
            {t.recorder.start}
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
          {t.recorder.keepsRunning}
          <br />
          {settings ? (
            <>
              {t.recorder.widgetHintPrefix}
              <kbd className={styles.key}>{formatAccelerator(settings.recordingShortcut)}</kbd>
              {t.recorder.widgetHintSuffix}
            </>
          ) : (
            t.recorder.widgetHintPlain
          )}
        </p>
      </div>

      {/* 진행 중인 녹음이 있으면 참석자 수가 그 녹음 몫이라 가져오기를 숨긴다 */}
      {isRecording ? null : <ImportAudioButton />}
    </section>
  )
}
