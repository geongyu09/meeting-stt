import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import usePipelineProgress from '@renderer/shared/hooks/domain/pipeline/usePipelineProgress'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

interface PipelineProgressProps {
  meetingId: string
}

/** 홈 목록 카드와 회의 상세가 함께 쓰는 진행률 표시 (references/architecture.md) */
export default function PipelineProgress({ meetingId }: PipelineProgressProps) {
  const { t } = useLocale()
  const { stage, percent } = usePipelineProgress({ meetingId })
  const label = stage ? t.pipeline.stages[stage] : t.pipeline.waiting

  return (
    <div className={styles.container}>
      <span className={styles.status}>
        <span className={styles.label}>{label}</span>
        <span className={styles.percent}>{percent}%</span>
      </span>
      <ProgressBar percent={percent} label={t.pipeline.progressLabel} />
    </div>
  )
}
