import { useId } from 'react'
import { isLocale, LOCALE_NAMES, LOCALES, type Locale } from '@shared/i18n'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './LocaleSelect.module.css'

interface LocaleSelectProps {
  value: Locale
  onChange: (locale: Locale) => void
}

/** UI 언어. 인식·요약 언어가 아니라는 점을 설명에 적는다 (references/architecture.md "UI 언어") */
export default function LocaleSelect({ value, onChange }: LocaleSelectProps) {
  const { t } = useLocale()
  const titleId = useId()

  return (
    <SettingRow
      title={t.settings.locale.title}
      titleId={titleId}
      description={t.settings.locale.description}
      control={
        <select
          className={styles.select}
          aria-labelledby={titleId}
          value={value}
          onChange={(event) => {
            if (isLocale(event.target.value)) onChange(event.target.value)
          }}
        >
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {LOCALE_NAMES[locale]}
            </option>
          ))}
        </select>
      }
    />
  )
}
