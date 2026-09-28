import { useId } from 'react'
import { isThemePreference, THEME_PREFERENCES, type ThemePreference } from '@shared/theme'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './ThemeSelect.module.css'

interface ThemeSelectProps {
  value: ThemePreference
  onChange: (theme: ThemePreference) => void
}

/** 화면 테마. 적용은 main의 nativeTheme이 하고 이 컴포넌트는 값만 고른다 (references/architecture.md "다크 모드") */
export default function ThemeSelect({ value, onChange }: ThemeSelectProps) {
  const { t } = useLocale()
  const titleId = useId()

  return (
    <SettingRow
      title={t.settings.theme.title}
      titleId={titleId}
      description={t.settings.theme.description}
      control={
        <select
          className={styles.select}
          aria-labelledby={titleId}
          value={value}
          onChange={(event) => {
            if (isThemePreference(event.target.value)) onChange(event.target.value)
          }}
        >
          {THEME_PREFERENCES.map((theme) => (
            <option key={theme} value={theme}>
              {t.settings.theme.options[theme]}
            </option>
          ))}
        </select>
      }
    />
  )
}
