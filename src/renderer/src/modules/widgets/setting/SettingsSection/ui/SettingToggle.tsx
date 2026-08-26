import type { ReactNode } from 'react'

import styles from './SettingToggle.module.css'

interface SettingToggleProps {
  title: string
  isChecked: boolean
  onChange: (isChecked: boolean) => void
  /** 설정을 껐을 때 무엇이 달라지는지. 되돌릴 수 없는 결과는 여기에 적는다 */
  children: ReactNode
}

export default function SettingToggle({
  title,
  isChecked,
  onChange,
  children
}: SettingToggleProps) {
  return (
    <label className={styles.option}>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.optionBody}>
        <span className={styles.optionTitle}>{title}</span>
        <span className={styles.optionHint}>{children}</span>
      </span>
    </label>
  )
}
