import useMeeting from '@renderer/shared/hooks/domain/meeting/useMeeting'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import DoneCard from './ui/DoneCard'
import FailedCard from './ui/FailedCard'
import ProcessingCard from './ui/ProcessingCard'
import styles from './index.module.css'

interface RecordCardProps {
  meetingId: string
}

/**
 * 대화 속 기록 카드 (references/features/recording.md "채팅 창의 녹음" > "기록 카드").
 * 회의 상태에 따라 처리 중 · 실패 · 완료 모양이고, 상태 전환은 `useMeeting`이 진행률·목록 변경 이벤트로 따라간다.
 */
export default function RecordCard({ meetingId }: RecordCardProps) {
  const { t } = useLocale()
  const {
    meeting,
    utterances,
    speakers,
    refineResult,
    saveError,
    reprocessMeeting,
    removeMeeting
  } = useMeeting({ meetingId })

  // 녹음 중인 회의는 카드가 아니라 "녹음을 시작했어요" 줄이다 (채팅이 그린다)
  if (!meeting || meeting.status === 'recording') return null

  const renderBody = () => {
    if (meeting.status === 'processing') return <ProcessingCard meeting={meeting} />
    if (meeting.status === 'error') {
      return (
        <FailedCard
          meeting={meeting}
          error={saveError}
          onRetry={() => reprocessMeeting({ speakerCount: meeting.speakerCount ?? null })}
        />
      )
    }

    return (
      <DoneCard
        meeting={meeting}
        utterances={utterances}
        speakers={speakers}
        refineResult={refineResult}
        saveError={saveError}
        onDelete={removeMeeting}
      />
    )
  }

  return (
    <article className={styles.card} aria-label={t.transcript.card.label({ title: meeting.title })}>
      {renderBody()}
    </article>
  )
}
