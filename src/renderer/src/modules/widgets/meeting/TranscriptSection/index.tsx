import { useNavigate } from 'react-router'
import PipelineProgress from '@renderer/modules/features/pipeline/PipelineProgress'
import useMeeting from '@renderer/shared/hooks/domain/meeting/useMeeting'
import { PATHS } from '@renderer/shared/routes/paths'

import useTranscriptCopy from './model/useTranscriptCopy'
import SpeakerBar from './ui/SpeakerBar'
import TranscriptHeader from './ui/TranscriptHeader'
import UtteranceRow from './ui/UtteranceRow'
import { toSpeakerOptions } from './utils/toSpeakerOptions'
import styles from './index.module.css'

interface TranscriptSectionProps {
  meetingId: string
}

export default function TranscriptSection({ meetingId }: TranscriptSectionProps) {
  const navigate = useNavigate()
  const {
    meeting,
    utterances,
    speakers,
    isLoading,
    error,
    saveError,
    renameMeeting,
    editUtteranceText,
    reassignUtterance,
    renameSpeaker,
    mergeSpeakers,
    removeMeeting
  } = useMeeting({ meetingId })

  const speakerOptions = toSpeakerOptions({ speakers, utterances })
  const speakerNames = Object.fromEntries(speakerOptions.map(({ label, name }) => [label, name]))
  const { copiedKey, copyError, copyAll, copyUtterance } = useTranscriptCopy({
    utterances,
    speakerNames
  })

  if (isLoading && !meeting) return <p className={styles.message}>회의를 불러오는 중입니다</p>
  if (error) return <p className={styles.error}>{error.message}</p>
  if (!meeting) return <p className={styles.message}>회의를 찾을 수 없습니다</p>

  const actionError = saveError ?? copyError

  const handleDelete = async () => {
    if (await removeMeeting()) navigate(PATHS.home)
  }

  const renderBody = () => {
    if (meeting.status === 'recording')
      return <p className={styles.message}>녹음이 진행 중입니다</p>

    if (meeting.status === 'processing') {
      return (
        <div className={styles.pending}>
          <p className={styles.message}>
            회의록을 만들고 있습니다. 시간이 걸릴 수 있으니 잠시만 기다려 주세요
          </p>
          <PipelineProgress meetingId={meetingId} />
        </div>
      )
    }

    if (meeting.status === 'error') {
      return <p className={styles.error}>{meeting.errorMessage ?? '회의록을 만들지 못했습니다'}</p>
    }

    if (!utterances.length) return <p className={styles.message}>인식된 발화가 없습니다</p>

    return (
      <>
        <SpeakerBar
          speakerOptions={speakerOptions}
          onRenameSpeaker={renameSpeaker}
          onMergeSpeakers={mergeSpeakers}
        />
        <ul className={styles.list}>
          {utterances.map((utterance) => (
            <UtteranceRow
              key={utterance.id}
              utterance={utterance}
              speakerOptions={speakerOptions}
              isCopied={copiedKey === utterance.id}
              onChangeSpeaker={reassignUtterance}
              onCommitText={editUtteranceText}
              onCopy={copyUtterance}
            />
          ))}
        </ul>
      </>
    )
  }

  return (
    <section className={styles.section}>
      <TranscriptHeader
        meeting={meeting}
        isCopyEnabled={utterances.length > 0}
        copiedKey={copiedKey}
        onRenameTitle={(title) => renameMeeting({ title })}
        onCopy={copyAll}
        onDelete={handleDelete}
      />
      {actionError ? (
        <p className={styles.error} role="alert">
          {actionError.message}
        </p>
      ) : null}
      {renderBody()}
    </section>
  )
}
