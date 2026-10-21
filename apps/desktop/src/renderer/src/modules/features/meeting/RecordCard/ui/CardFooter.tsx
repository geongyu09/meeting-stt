import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type useRecordSummary from '../model/useRecordSummary'
import styles from './CardFooter.module.css'

interface CardFooterProps {
  summary: ReturnType<typeof useRecordSummary>
  /** 전체 기록 패널을 대화 옆에 연다 */
  onOpenFull: () => void
}

/** "전체 기록 보기" · 요약 템플릿 · 다시 요약 */
export default function CardFooter({ summary, onOpenFull }: CardFooterProps) {
  const { t } = useLocale()
  const isPickerVisible = summary.templates.length > 1

  return (
    <footer className={styles.footer}>
      <button type="button" className={styles.openFull} onClick={onOpenFull}>
        {t.transcript.card.openFull}
      </button>
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
