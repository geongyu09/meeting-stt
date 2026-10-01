import type { SummaryTemplate } from '@shared/types'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './TemplatePicker.module.css'

interface TemplatePickerProps {
  templates: SummaryTemplate[]
  value: string
  isDisabled: boolean
  onChange: (templateId: string) => void
}

/** 요약할 때마다 고른다. 고른 것은 기억하지 않는다 (references/architecture.md "요약 템플릿 > 화면") */
export default function TemplatePicker({
  templates,
  value,
  isDisabled,
  onChange
}: TemplatePickerProps) {
  const { t } = useLocale()

  return (
    <select
      className={styles.select}
      aria-label={t.summaryTemplate.picker.label}
      value={value}
      disabled={isDisabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {templates.map((template) => (
        <option key={template.id} value={template.id}>
          {template.isBuiltIn ? t.summaryTemplate.defaultName : template.name}
        </option>
      ))}
    </select>
  )
}
