import PipelineProgress from '@renderer/modules/features/pipeline/PipelineProgress'
import RefinePanel from '@renderer/modules/features/refine/RefinePanel'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import useMeeting from '@renderer/shared/hooks/domain/meeting/useMeeting'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useAudioSeek from './model/useAudioSeek'
import useTranscriptCopy from './model/useTranscriptCopy'
import AudioQualityNotice from './ui/AudioQualityNotice'
import Placeholder from './ui/Placeholder'
import RecordingBar from './ui/RecordingBar'
import SpeakerPanel from './ui/SpeakerPanel'
import TranscriptActions from './ui/TranscriptActions'
import TranscriptCopyActions from './ui/TranscriptCopyActions'
import TranscriptHeader from './ui/TranscriptHeader'
import UtteranceRow from './ui/UtteranceRow'
import { toSpeakerOptions } from './utils/toSpeakerOptions'
import styles from './index.module.css'

const CLOSE_ICON_SIZE = 18

interface TranscriptSectionProps {
  meetingId: string
  /** 패널을 닫는다. 삭제가 끝났을 때도 부른다 */
  onClose: () => void
}

/**
 * 대화 옆에 열리는 전체 기록 패널 (references/features/recording.md "채팅 창의 녹음" > "전체 기록 패널").
 * 헤더(제목·복사·더보기·닫기) · 화자 칩 줄 · 발화 목록 · 하단 녹음본 줄. 화자 칩이 발화와 같은 `useMeeting` 상태를 써야 해서 여기서 함께 그린다.
 */
export default function TranscriptSection({ meetingId, onClose }: TranscriptSectionProps) {
  const { t } = useLocale()
  const {
    meeting,
    utterances,
    speakers,
    refineResult,
    isLoading,
    error,
    saveError,
    renameMeeting,
    editUtteranceText,
    reassignUtterance,
    revertUtteranceRefine,
    renameSpeaker,
    mergeSpeakers,
    reprocessMeeting,
    removeMeeting
  } = useMeeting({ meetingId })

  const speakerOptions = toSpeakerOptions({
    speakers,
    utterances,
    defaultNames: {
      numbered: (index) => t.transcript.defaultSpeakerNames.numbered({ index }),
      unknown: t.transcript.defaultSpeakerNames.unknown
    }
  })
  const speakerNames = Object.fromEntries(speakerOptions.map(({ label, name }) => [label, name]))
  const { copiedKey, copyError, copyAll, copyUtterance } = useTranscriptCopy({
    utterances,
    speakerNames
  })
  const { audioRef, seekTo } = useAudioSeek()
  const panelLabel = t.transcript.panel.label

  if (isLoading && !meeting) {
    return (
      <section className={styles.panel} aria-label={panelLabel}>
        <Placeholder message={t.transcript.loading} onClose={onClose} />
      </section>
    )
  }
  if (error || !meeting) {
    return (
      <section className={styles.panel} aria-label={panelLabel}>
        <Placeholder message={error?.message ?? t.transcript.notFound} isError onClose={onClose} />
      </section>
    )
  }

  const actionError = saveError ?? copyError

  const handleDelete = async () => {
    if (await removeMeeting()) onClose()
  }

  const renderBody = () => {
    if (meeting.status === 'recording') {
      return <p className={styles.message}>{t.transcript.status.recording}</p>
    }

    if (meeting.status === 'processing') {
      return (
        <div className={styles.pending}>
          <p className={styles.message}>{t.transcript.status.processing}</p>
          <PipelineProgress meetingId={meetingId} />
        </div>
      )
    }

    if (meeting.status === 'error') {
      return (
        <div className={styles.failed}>
          <p className={styles.error}>{meeting.errorMessage ?? t.transcript.status.defaultError}</p>
          {meeting.hasAudio ? (
            // 보이는 회의록이 없어 잃을 것이 없으므로 확인 없이 저장된 참석자 수로 다시 돌린다
            <Button
              variant="secondary"
              size="sm"
              className={styles.retry}
              onClick={() => reprocessMeeting({ speakerCount: meeting.speakerCount ?? null })}
            >
              {t.transcript.status.retry}
            </Button>
          ) : null}
        </div>
      )
    }

    if (!utterances.length)
      return <p className={styles.message}>{t.transcript.status.noUtterances}</p>

    return (
      <ol className={styles.list}>
        {utterances.map((utterance) => (
          <UtteranceRow
            key={utterance.id}
            utterance={utterance}
            speakerOptions={speakerOptions}
            isCopied={copiedKey === utterance.id}
            onChangeSpeaker={reassignUtterance}
            onCommitText={editUtteranceText}
            onRevertRefine={revertUtteranceRefine}
            onCopy={copyUtterance}
            onSeek={meeting.hasAudio ? seekTo : undefined}
          />
        ))}
      </ol>
    )
  }

  return (
    <section className={styles.panel} aria-label={panelLabel}>
      <TranscriptHeader
        meeting={meeting}
        speakerCount={speakerOptions.length}
        onRenameTitle={(title) => renameMeeting({ title })}
        actions={
          <>
            <TranscriptCopyActions
              isCopyEnabled={utterances.length > 0}
              copiedKey={copiedKey}
              onCopy={copyAll}
            />
            <TranscriptActions onDelete={handleDelete} />
            <button
              type="button"
              className={styles.closeButton}
              aria-label={t.transcript.panel.close}
              onClick={onClose}
            >
              <Icon name="close" size={CLOSE_ICON_SIZE} />
            </button>
          </>
        }
      />
      {utterances.length ? (
        <SpeakerPanel
          speakerOptions={speakerOptions}
          onRenameSpeaker={renameSpeaker}
          onMergeSpeakers={mergeSpeakers}
        />
      ) : null}
      <div className={styles.scroll}>
        {actionError ? (
          <p className={styles.error} role="alert">
            {actionError.message}
          </p>
        ) : null}
        {meeting.status === 'done' && meeting.audioQualityIssue ? (
          <AudioQualityNotice issue={meeting.audioQualityIssue} />
        ) : null}
        {renderBody()}
        {meeting.status === 'done' && utterances.length ? (
          <RefinePanel meetingId={meetingId} refineResult={refineResult} />
        ) : null}
      </div>
      {meeting.status === 'done' || meeting.status === 'error' ? (
        <RecordingBar meeting={meeting} audioRef={audioRef} onReprocess={reprocessMeeting} />
      ) : null}
    </section>
  )
}
