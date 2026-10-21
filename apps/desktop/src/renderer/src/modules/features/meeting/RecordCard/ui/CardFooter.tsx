import { Link } from 'react-router'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { meetingDetailPath } from '@renderer/shared/routes/paths'

import type useRecordSummary from '../model/useRecordSummary'
import styles from './CardFooter.module.css'

interface CardFooterProps {
  meetingId: string
  summary: ReturnType<typeof useRecordSummary>
}

/**
 * "전체 기록 보기" · 요약 템플릿 · 다시 요약.
 * shortcut: 전체 기록은 아직 회의 상세 화면으로 간다, 전체 기록 패널(시안 "전체 기록 패널 · 대화 옆에 열림")이 생기면 옆 패널로 바꾼다
 */
export default function CardFooter({ meetingId, summary }: CardFooterProps) {
  const { t } = useLocale()
  const isPickerVisible = summary.templates.length > 1

  return (
    <footer className={styles.footer}>
      <Link className={styles.openFull} to={meetingDetailPath({ meetingId })}>
        {t.transcript.card.openFull}
      </Link>
      <span className={styles.spacer} />
      {isPickerVisible ? (
        <select
          className={styles.select}
          aria-label={t.summaryTemplate.picker.label}
          value={summary.selectedTemplateId}
          disabled={summary.isCreateDisabled}
          onChange={(event) => summary.selectTemplate(event.target.value)}
        >
          {summary.templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.isBuiltIn ? t.summaryTemplate.defaultName : template.name}
            </option>
          ))}
        </select>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        className={styles.summarize}
        disabled={summary.isCreateDisabled}
        onClick={summary.create}
      >
        {summary.summary ? t.summary.regenerate : t.summary.create}
      </Button>
    </footer>
  )
}
