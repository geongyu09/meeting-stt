import { useState, type RefObject } from 'react'
import { Link } from 'react-router'
import { meetingAudioUrl } from '@shared/ipc'
import type { Meeting } from '@shared/types'
import { MAX_SPEAKER_COUNT, MIN_SPEAKER_COUNT } from '@meeting-stt/core/speakerCount'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Stepper from '@renderer/shared/components/primitives/ui/Stepper'
import { PATHS } from '@renderer/shared/routes/paths'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useRecordingExport from '../model/useRecordingExport'
import { parseSpeakerCountText } from '../utils/parseSpeakerCountText'
import styles from './RecordingPanel.module.css'

interface RecordingPanelProps {
  meeting: Meeting
  audioRef: RefObject<HTMLAudioElement | null>
  onReprocess: (params: { speakerCount: number | null }) => Promise<boolean>
}

/**
 * 상세 레일의 원본 녹음 패널 — 재생·WAV 저장·다시 인식. 원본을 보관하지 않은 회의는 안내만 보인다
 * (references/architecture.md "녹음본 재생·내보내기·다시 인식"). 다시 인식은 회의록을 새로 만들므로 2단계 인라인 확인을 거친다.
 */
export default function RecordingPanel({ meeting, audioRef, onReprocess }: RecordingPanelProps) {
  const { t } = useLocale()
  const { recordingPanel: labels } = t.transcript
  const { isExporting, isSaved, error, exportRecording } = useRecordingExport({
    meetingId: meeting.id
  })
  const [isConfirming, setIsConfirming] = useState(false)
  const [speakerCountText, setSpeakerCountText] = useState('')
  const [isLoadFailed, setIsLoadFailed] = useState(false)
  const { speakerCount, isValid } = parseSpeakerCountText(speakerCountText)

  if (!meeting.hasAudio) {
    return (
      <section className={styles.section} aria-label={labels.sectionLabel}>
        <h2 className={styles.title}>{labels.title}</h2>
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

  return (
    <section className={styles.section} aria-label={labels.sectionLabel}>
      <h2 className={styles.title}>{labels.title}</h2>
      <audio
        ref={audioRef}
        className={styles.player}
        controls
        preload="metadata"
        src={meetingAudioUrl(meeting.id)}
        onError={() => setIsLoadFailed(true)}
      />
      {isLoadFailed ? (
        <p className={styles.error}>{labels.loadFailed}</p>
      ) : (
        <p className={styles.message}>{labels.seekHint}</p>
      )}
      {isConfirming ? (
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
      ) : (
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            className={styles.action}
            disabled={isExporting}
            onClick={exportRecording}
          >
            {isSaved ? labels.exported : labels.exportWav}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className={styles.action}
            onClick={handleOpenConfirm}
          >
            {labels.reprocess}
          </Button>
        </div>
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  )
}
