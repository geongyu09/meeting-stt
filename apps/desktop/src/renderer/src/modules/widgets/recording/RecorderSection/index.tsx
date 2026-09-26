import { useState } from 'react'
import { MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@meeting-stt/core/speakerCount'
import { formatAccelerator } from '@shared/shortcut'
import ImportAudioButton from '@renderer/modules/features/meeting/ImportAudioButton'
import {
  controlRecordingApi,
  setLiveTranscriptApi,
  setSystemAudioApi
} from '@renderer/shared/api/recording'
import Badge from '@renderer/shared/components/primitives/ui/Badge'
import Button from '@renderer/shared/components/primitives/ui/Button'
import LevelWaveform from '@renderer/shared/components/primitives/ui/LevelWaveform'
import Stepper from '@renderer/shared/components/primitives/ui/Stepper'
import Switch from '@renderer/shared/components/primitives/ui/Switch'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSpeakerCount from '@renderer/shared/hooks/domain/recording/useSpeakerCount'
import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatClock } from '@renderer/shared/utils/formatClock'

import LiveTranscriptView from './ui/LiveTranscriptView'
import ViewModeToggle from './ui/ViewModeToggle'
import styles from './index.module.css'

const WAVEFORM_BAR_COUNT = 48
const SYSTEM_AUDIO_LABEL_ID = 'recorderSystemAudioLabel'

/**
 * 메인 창의 녹음 화면. 오디오 그래프는 위젯 패널이 들고 있으므로 여기서는 명령을 보내고
 * 상태를 구독만 한다 (references/architecture.md의 "녹음 위젯 패널").
 */
export default function RecorderSection() {
  const { t: messages } = useLocale()
  const t = messages.recording
  const {
    isRecording,
    level,
    elapsedSec,
    speakerCount,
    errorMessage,
    liveTranscript,
    systemAudio
  } = useRecordingState()
  const { text, isValid, changeText } = useSpeakerCount({ speakerCount })
  const { settings } = useSettings()
  const [controlError, setControlError] = useState<string | null>(null)
  const [isSystemAudioBusy, setIsSystemAudioBusy] = useState(false)

  // 켜기는 main이 도구를 잠깐 돌려 권한 창을 띄우므로 끝날 때까지 스위치를 잠근다
  const handleSystemAudioChange = async (isEnabled: boolean) => {
    setIsSystemAudioBusy(true)
    try {
      await setSystemAudioApi({ isEnabled })
      setControlError(null)
    } catch {
      setControlError(t.systemAudio.toggleError)
    } finally {
      setIsSystemAudioBusy(false)
    }
  }

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
        <div className={styles.statusRow}>
          <span className={isRecording ? styles.recordingStatus : styles.idleStatus}>
            <span className={styles.dot} aria-hidden="true" />
            {isRecording ? t.status.recording : t.status.idle}
          </span>
          {isRecording && systemAudio.isEnabled ? (
            <Badge tone="accent">{t.systemAudio.badge}</Badge>
          ) : null}
        </div>
        <p className={styles.elapsed}>{formatClock({ sec: elapsedSec })}</p>
      </div>

      <div className={styles.display}>
        <ViewModeToggle isLive={liveTranscript.isEnabled} onChange={handleViewChange} />
        {liveTranscript.isEnabled ? (
          <LiveTranscriptView liveTranscript={liveTranscript} isRecording={isRecording} />
        ) : (
          <LevelWaveform level={level} barCount={WAVEFORM_BAR_COUNT} />
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

      <div className={styles.optionRow}>
        <div className={styles.optionText}>
          <span id={SYSTEM_AUDIO_LABEL_ID} className={styles.optionTitle}>
            {t.systemAudio.label}
          </span>
          <span
            className={systemAudio.errorMessage ? styles.error : styles.optionHint}
            role={systemAudio.errorMessage ? 'alert' : undefined}
          >
            {systemAudio.errorMessage ?? t.systemAudio.hint}
          </span>
        </div>
        <Switch
          isChecked={systemAudio.isEnabled}
          onChange={handleSystemAudioChange}
          ariaLabelledBy={SYSTEM_AUDIO_LABEL_ID}
          disabled={isRecording || isSystemAudioBusy}
        />
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
