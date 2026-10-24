import { useState } from 'react'
import { Link } from 'react-router'
import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import InlineEditableText from '@renderer/shared/components/composites/InlineEditableText'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS } from '@renderer/shared/routes/paths'

import type useRecordSummary from '../model/useRecordSummary'
import styles from './SummaryBlock.module.css'

const COPY_ICON_SIZE = 16

interface SummaryBlockProps {
  summary: ReturnType<typeof useRecordSummary>
}

/**
 * "요약 · 공급자" 줄과 본문. 본문은 진행률 → 요약 → 안내 순서로 회의 상세의 요약 카드와 같은 규칙이다.
 * 작업 폴더에 요약 파일이 있으면 그 내용을 그 자리에서 고쳐 파일에 저장한다
 */
export default function SummaryBlock({ summary }: SummaryBlockProps) {
  const { t } = useLocale()
  const [copyError, setCopyError] = useState<string | null>(null)

  const copy = async () => {
    try {
      await writeClipboardTextApi({ text: summary.summary })
      setCopyError(null)
    } catch (caught) {
      setCopyError(caught instanceof Error ? caught.message : t.summary.errors.copy)
    }
  }

  const renderBody = () => {
    if (summary.isRunning) {
      return (
        <div className={styles.pending}>
          <span className={styles.message}>
            {summary.stage ? t.summary.stages[summary.stage] : ''}
          </span>
          <ProgressBar percent={summary.percent} label={t.summary.progressLabel} />
        </div>
      )
    }
    if (summary.isFileSummary) {
      return (
        <InlineEditableText
          // 확정 값은 앞뒤 공백을 자른 것이라, 비교도 자른 값과 해야 고치지 않은 blur에 저장하지 않는다
          value={summary.summary.trim()}
          onCommit={summary.saveFileSummary}
          ariaLabel={t.transcript.card.summaryEditLabel}
          isMultiline
          className={styles.text}
        />
      )
    }
    if (summary.summary) return <p className={styles.text}>{summary.summary}</p>
    if (summary.isCreateDisabled && summary.missingMessage) {
      return (
        <p className={styles.message}>
          {summary.missingMessage}.{' '}
          <Link className={styles.link} to={PATHS.settings}>
            {t.summary.prepareInSettings}
          </Link>
        </p>
      )
    }

    return (
      <p className={styles.message}>
        {summary.isCreateDisabled
          ? t.summary.noUtterances
          : t.summary.empty({ provider: summary.providerLabel })}
      </p>
    )
  }

  const error = copyError ?? summary.error

  return (
    <div className={styles.block}>
      <div className={styles.labelRow}>
        {summary.isFileSummary
          ? t.transcript.card.summaryFileLabel
          : t.transcript.card.summaryLabel({ provider: summary.providerLabel })}
        {summary.summary && !summary.isRunning ? (
          <button
            type="button"
            className={styles.copyButton}
            aria-label={t.transcript.card.copySummary}
            onClick={copy}
          >
            <Icon name="copy" size={COPY_ICON_SIZE} />
          </button>
        ) : null}
      </div>
      {renderBody()}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
