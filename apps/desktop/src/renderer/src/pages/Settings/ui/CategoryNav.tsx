import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { SETTINGS_CATEGORIES, type SettingsCategory } from '../constants/categories'
import styles from './CategoryNav.module.css'

interface CategoryNavProps {
  value: SettingsCategory
  onChange: (category: SettingsCategory) => void
}

/** 설정 모달 왼쪽의 카테고리 목록. 현재 카테고리는 `aria-current`로 표시한다 */
export default function CategoryNav({ value, onChange }: CategoryNavProps) {
  const { t } = useLocale()
  const labels: Record<SettingsCategory, string> = {
    assistant: t.assistant.settings.title,
    appearance: t.settings.groups.appearance,
    microphone: t.settings.groups.microphone,
    recording: t.settings.groups.recording,
    widget: t.settings.groups.widget,
    shortcut: t.settings.groups.shortcut,
    dictation: t.settings.groups.dictation,
    sttModel: t.settings.groups.sttModel,
    llm: t.llm.section.title,
    summaryTemplate: t.summaryTemplate.section.title,
    glossary: t.glossary.section.title,
    update: t.settings.groups.update,
    language: t.settings.groups.language,
    feedback: t.settings.groups.feedback
  }

  return (
    <nav className={styles.nav} aria-label={t.settings.toc}>
      {SETTINGS_CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          className={styles.item}
          aria-current={category === value ? 'true' : undefined}
          onClick={() => onChange(category)}
        >
          {labels[category]}
        </button>
      ))}
    </nav>
  )
}
