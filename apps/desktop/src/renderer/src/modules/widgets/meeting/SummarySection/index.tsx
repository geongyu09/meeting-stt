import { useId, useState } from 'react'
import { Link } from 'react-router'
import { llmMissingMessage } from '@shared/llm'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import useLlmStatus from '@renderer/shared/hooks/domain/llm/useLlmStatus'
import useMeeting from '@renderer/shared/hooks/domain/meeting/useMeeting'
import useSummary from '@renderer/shared/hooks/domain/meeting/useSummary'
import { PATHS } from '@renderer/shared/routes/paths'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useSummaryCopy from './model/useSummaryCopy'
import styles from './index.module.css'

interface SummarySectionProps {
  meetingId: string
}

const CHEVRON_SIZE = 14

export default function SummarySection({ meetingId }: SummarySectionProps) {
  const { t } = useLocale()
  const { meeting, utterances } = useMeeting({ meetingId })
  const { summary, stage, percent, error, isRunning, createSummary } = useSummary({
    meetingId,
    initialSummary: meeting?.summary
  })
  const { isCopied, copyError, copySummary } = useSummaryCopy({ summary })
  const { status: llmStatus } = useLlmStatus()
  const [isExpanded, setIsExpanded] = useState(true)
  const bodyId = useId()

  // 회의록이 아직 없으면 요약할 것도 없다
  if (meeting?.status !== 'done') return null

  const hasTranscript = utterances.length > 0
  // 상태를 아직 모르면 막지 않는다. 준비 문구는 main과 같은 함수로 만든다 (references/architecture.md "LLM 공급자")
  const missingMessage = llmStatus ? llmMissingMessage(llmStatus, t.llm) : null
  const providerLabel = llmStatus ? t.llm.providerLabels[llmStatus.provider] : ''
  // 접어 둔 채로 요약이 돌면 진행률이 안 보이므로 캡션이 대신 알려 준다
  const caption = !isExpanded && isRunning ? t.summary.runningCaption({ percent }) : providerLabel

  const renderBody = () => {
    if (isRunning) {
      return (
        <div className={styles.pending}>
          <p className={styles.message}>{stage ? t.summary.stages[stage] : ''}</p>
          <ProgressBar percent={percent} label={t.summary.progressLabel} />
        </div>
      )
    }

    if (summary) return <p className={styles.summary}>{summary}</p>
    if (!hasTranscript) return <p className={styles.message}>{t.summary.noUtterances}</p>
    if (missingMessage) {
      return (
        <p className={styles.message}>
          {missingMessage}.{' '}
          <Link className={styles.link} to={PATHS.settings}>
            {t.summary.prepareInSettings}
          </Link>
        </p>
      )
    }

    return (
      <p className={styles.message}>
        {t.summary.empty({ provider: providerLabel || t.summary.fallbackProvider })}
      </p>
    )
  }

  return (
    <section className={styles.section} aria-label={t.summary.sectionLabel}>
      {/* 헤더 전체가 접기 버튼이라 상단 어디를 눌러도 접힌다 */}
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={isExpanded}
        aria-controls={bodyId}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={styles.chevron}>
          <Icon name="chevronDown" size={CHEVRON_SIZE} />
        </span>
        <h2 className={styles.title}>{t.summary.title}</h2>
        <span className={styles.caption}>{caption}</span>
      </button>

      {isExpanded && (
        <div id={bodyId} className={styles.body}>
          {renderBody()}

          {error && <p className={styles.error}>{error}</p>}
          {copyError && <p className={styles.error}>{copyError}</p>}

          <div className={styles.actions}>
            {summary && !isRunning && (
              <Button variant="secondary" size="sm" className={styles.action} onClick={copySummary}>
                {isCopied ? t.summary.copied : t.summary.copy}
              </Button>
            )}
            <Button
              size="sm"
              className={styles.action}
              onClick={createSummary}
              disabled={isRunning || !hasTranscript || missingMessage !== null}
            >
              {summary ? t.summary.regenerate : t.summary.create}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
