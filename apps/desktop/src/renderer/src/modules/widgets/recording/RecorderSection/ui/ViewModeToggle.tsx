import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './ViewModeToggle.module.css'

interface ViewModeToggleProps {
  isLive: boolean
  onChange: (isLive: boolean) => void
}

/** 파형 ↔ 라이브 받아쓰기 보기 전환 */
export default function ViewModeToggle({ isLive, onChange }: ViewModeToggleProps) {
  const { t: messages } = useLocale()
  const t = messages.recording.live
  const options = [
    { isLiveOption: false, label: t.waveform },
    { isLiveOption: true, label: t.transcript }
  ]

  return (
    <div className={styles.container} role="group" aria-label={t.viewLabel}>
      {options.map(({ isLiveOption, label }) => (
        <button
          key={label}
          type="button"
          className={isLive === isLiveOption ? styles.selected : styles.option}
          aria-pressed={isLive === isLiveOption}
          onClick={() => onChange(isLiveOption)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
