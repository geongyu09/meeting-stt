import type { Meeting } from '@shared/types'
import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import usePipelineProgress from '@renderer/shared/hooks/domain/pipeline/usePipelineProgress'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatDurationShort } from '@renderer/shared/utils/formatDuration'

import styles from './ProcessingCard.module.css'

interface ProcessingCardProps {
  meeting: Meeting
}

/** 회의록을 만드는 중인 카드. 제목 · 길이 · 단계와 퍼센트 · 진행 막대 */
export default function ProcessingCard({ meeting }: ProcessingCardProps) {
  const { t, locale } = useLocale()
  const { stage, percent } = usePipelineProgress({ meetingId: meeting.id })
  const label = stage ? t.pipeline.stages[stage] : t.pipeline.waiting

  return (
    <div className={styles.body}>
      <div className={styles.titleRow}>
        <b className={styles.title}>{meeting.title}</b>
        {meeting.durationSec > 0 ? (
          <span className={styles.meta}>
            {formatDurationShort({ sec: meeting.durationSec, locale })}
          </span>
        ) : null}
      </div>
      <div className={styles.progressRow}>
        <span>{label}</span>
        <span className={styles.percent}>{percent}%</span>
      </div>
      <ProgressBar percent={percent} label={t.pipeline.progressLabel} />
    </div>
  )
}
