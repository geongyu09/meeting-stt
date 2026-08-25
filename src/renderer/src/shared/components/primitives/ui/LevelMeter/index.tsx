import styles from './index.module.css'

interface LevelMeterProps {
  /** 0~1 범위의 입력 세기 */
  level: number
}

const PERCENT = 100

export default function LevelMeter({ level }: LevelMeterProps) {
  const width = `${Math.min(PERCENT, Math.max(0, level * PERCENT))}%`

  return (
    <div className={styles.track} role="meter" aria-label="마이크 입력 세기" aria-valuenow={level}>
      <div className={styles.bar} style={{ width }} />
    </div>
  )
}
