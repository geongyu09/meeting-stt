import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './OpacitySlider.module.css'

interface OpacitySliderProps {
  value: number
  min: number
  max: number
  step: number
  isDisabled: boolean
  onChange: (value: number) => void
}

const PERCENT = 100

export default function OpacitySlider({
  value,
  min,
  max,
  step,
  isDisabled,
  onChange
}: OpacitySliderProps) {
  const { t } = useLocale()

  return (
    <label className={styles.slider}>
      <span className={styles.label}>{t.settings.opacity.label}</span>
      <input
        className={styles.input}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={isDisabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className={styles.value}>{Math.round(value * PERCENT)}%</span>
    </label>
  )
}
