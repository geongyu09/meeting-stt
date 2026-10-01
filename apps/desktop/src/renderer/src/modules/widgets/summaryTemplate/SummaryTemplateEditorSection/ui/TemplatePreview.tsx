import { buildTemplatePreview, compileTemplate } from '@shared/summaryTemplate'
import type { SummaryBlock } from '@shared/types'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './TemplatePreview.module.css'

interface TemplatePreviewProps {
  blocks: SummaryBlock[]
}

/** 결과 모양을 먼저 보여 주고, AI에게 보내는 지시문 전문은 접어 둔다 */
export default function TemplatePreview({ blocks }: TemplatePreviewProps) {
  const { t } = useLocale()
  if (!blocks.length) return null

  return (
    <div className={styles.preview}>
      <span className={styles.label}>{t.summaryTemplate.section.previewLabel}</span>
      <pre className={styles.skeleton}>{buildTemplatePreview({ blocks })}</pre>
      <details className={styles.prompt}>
        <summary className={styles.promptToggle}>{t.summaryTemplate.section.promptToggle}</summary>
        <pre className={styles.skeleton}>{compileTemplate({ blocks }).finalFormat}</pre>
      </details>
    </div>
  )
}
