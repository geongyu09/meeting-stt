import type { CSSProperties } from 'react'

import styles from './index.module.css'

interface LevelWaveformProps {
  /** 0~1 현재 입력 세기 */
  level: number
  barCount: number
  size?: 'md' | 'sm'
}

const PERCENT = 100
/** 무음에서도 막대가 점으로 보이도록 남기는 최소 높이(%) */
const MIN_BAR_PERCENT = 8
/** RMS는 말소리에서도 0.1~0.3에 머문다. 그대로 그리면 막대가 바닥에 붙는다 */
const LEVEL_GAIN = 3
/** 종 모양 포락선의 너비(전체 대비). 작을수록 가운데만 솟는다 */
const ENVELOPE_WIDTH_RATIO = 0.34
/** 양끝 막대도 이만큼은 따라 움직이게 남기는 포락선 바닥값 */
const ENVELOPE_FLOOR = 0.3
/** 막대별 고정 계수의 진폭·주기. 옆 막대와 높이가 어긋나야 파형처럼 보인다 */
const RIPPLE_DEPTH = 0.22
const RIPPLE_PHASE_STEP = 2.3
/** 최대 음량에서 막대가 흔들리는 비율. 레벨에 비례해 줄어든다 */
const MAX_PULSE_RATIO = 0.45
const PULSE_DURATION_MIN_MS = 260
const PULSE_DURATION_STEP_MS = 55
const PULSE_DURATION_VARIANTS = 5
const PULSE_DELAY_STEP_MS = 37

const clampLevel = (level: number) => Math.min(1, Math.max(0, level * LEVEL_GAIN))

const envelopeOf = ({ index, barCount }: { index: number; barCount: number }) => {
  const center = (barCount - 1) / 2
  const spread = Math.max(1, barCount * ENVELOPE_WIDTH_RATIO)
  const distance = (index - center) / spread
  const bell = Math.exp(-distance * distance)

  return ENVELOPE_FLOOR + (1 - ENVELOPE_FLOOR) * bell
}

const rippleOf = (index: number) =>
  1 - RIPPLE_DEPTH * (0.5 + 0.5 * Math.sin(index * RIPPLE_PHASE_STEP))

const heightOf = ({
  level,
  index,
  barCount
}: {
  level: number
  index: number
  barCount: number
}) => {
  const shape = envelopeOf({ index, barCount }) * rippleOf(index)

  return MIN_BAR_PERCENT + (PERCENT - MIN_BAR_PERCENT) * clampLevel(level) * shape
}

/**
 * 이퀄라이저형 레벨 미터. 모든 막대가 현재 레벨에 함께 반응한다 (references/architecture.md "공통 컴포넌트").
 * 데스크탑 `shared/components/primitives/ui/LevelWaveform`과 같은 계약이다.
 */
export default function LevelWaveform({ level, barCount, size = 'md' }: LevelWaveformProps) {
  const pulseRatio = MAX_PULSE_RATIO * clampLevel(level)

  return (
    <div
      className={[styles.waveform, styles[size]].join(' ')}
      role="meter"
      aria-label="마이크 입력 세기"
      aria-valuemin={0}
      aria-valuemax={PERCENT}
      aria-valuenow={Math.round(Math.min(1, level) * PERCENT)}
    >
      {Array.from({ length: barCount }, (_, index) => {
        const barStyle = {
          height: `${heightOf({ level, index, barCount })}%`,
          '--pulse': pulseRatio,
          '--pulse-duration': `${PULSE_DURATION_MIN_MS + (index % PULSE_DURATION_VARIANTS) * PULSE_DURATION_STEP_MS}ms`,
          '--pulse-delay': `-${index * PULSE_DELAY_STEP_MS}ms`
        } as CSSProperties

        // 막대의 위치 자체가 정체성이다. 값이 바뀌어도 칸은 그대로다
        return <span key={index} className={styles.bar} style={barStyle} />
      })}
    </div>
  )
}
