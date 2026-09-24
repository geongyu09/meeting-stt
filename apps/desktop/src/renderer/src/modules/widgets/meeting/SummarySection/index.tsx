import { Link } from 'react-router'
import Button from '@renderer/shared/components/primitives/ui/Button'
import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import useMeeting from '@renderer/shared/hooks/domain/meeting/useMeeting'
import useSummary from '@renderer/shared/hooks/domain/meeting/useSummary'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'
import { PATHS } from '@renderer/shared/routes/paths'

import { STAGE_MESSAGES } from './constants/stage'
import useSummaryCopy from './model/useSummaryCopy'
import styles from './index.module.css'

interface SummarySectionProps {
  meetingId: string
}

export default function SummarySection({ meetingId }: SummarySectionProps) {
  const { meeting, utterances } = useMeeting({ meetingId })
  const { summary, stage, percent, error, isRunning, createSummary } = useSummary({
    meetingId,
    initialSummary: meeting?.summary
  })
  const { isCopied, copyError, copySummary } = useSummaryCopy({ summary })
  const { status: modelStatus } = useModelStatus()

  // 회의록이 아직 없으면 요약할 것도 없다
  if (meeting?.status !== 'done') return null

  const hasTranscript = utterances.length > 0
  // 상태를 아직 모르면 막지 않는다. 요약 모델은 선택 모델이라 설정에서 따로 받는다 (references/distribution.md)
  const isModelMissing = modelStatus !== null && !modelStatus.isSummaryReady

  const renderBody = () => {
    if (isRunning) {
      return (
        <div className={styles.pending}>
          <p className={styles.message}>{stage ? STAGE_MESSAGES[stage] : ''}</p>
          <ProgressBar percent={percent} label="요약 진행률" />
        </div>
      )
    }

    if (summary) return <p className={styles.summary}>{summary}</p>
    if (!hasTranscript) return <p className={styles.message}>요약할 발화가 없습니다</p>
    if (isModelMissing) {
      return (
        <p className={styles.message}>
          요약 모델이 설치되어 있지 않습니다.{' '}
          <Link className={styles.link} to={PATHS.settings}>
            설정에서 요약 모델 받기
          </Link>
        </p>
      )
    }

    return (
      <p className={styles.message}>
        아직 요약이 없습니다. 회의록을 로컬 모델로 요약하며, 회의 길이에 따라 몇 분이 걸립니다
      </p>
    )
  }

  return (
    <section className={styles.section} aria-label="회의 요약">
      <header className={styles.header}>
        <h2 className={styles.title}>요약</h2>
        <span className={styles.caption}>로컬 모델</span>
      </header>

      {renderBody()}

      {error && <p className={styles.error}>{error}</p>}
      {copyError && <p className={styles.error}>{copyError}</p>}

      <div className={styles.actions}>
        {summary && !isRunning && (
          <Button variant="secondary" size="sm" className={styles.action} onClick={copySummary}>
            {isCopied ? '복사됨' : '요약 복사'}
          </Button>
        )}
        <Button
          size="sm"
          className={styles.action}
          onClick={createSummary}
          disabled={isRunning || !hasTranscript || isModelMissing}
        >
          {summary ? '다시 요약' : '요약 만들기'}
        </Button>
      </div>
    </section>
  )
}
