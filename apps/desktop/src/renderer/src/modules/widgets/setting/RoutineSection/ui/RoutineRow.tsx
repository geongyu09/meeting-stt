import { useState } from 'react'
import { nextRoutineRunAt } from '@shared/routine'
import type { Routine } from '@shared/types'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Switch from '@renderer/shared/components/primitives/ui/Switch'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatMeetingDay, formatMeetingTime } from '@renderer/shared/utils/formatMeetingDate'
import { summarizeSchedule } from '@renderer/shared/utils/summarizeSchedule'

import type { RoutineRunState } from '../types/routineForm'
import styles from './RoutineRow.module.css'

interface RoutineRowProps {
  routine: Routine
  runState: RoutineRunState
  /** 다음 실행·마지막 실행의 날짜 표기 기준 (렌더 중에 Date.now()를 부르지 않는다) */
  now: number
  onToggle: (isEnabled: boolean) => void
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
}

/** 루틴 한 행. 주기·다음 실행·마지막 실행과 켜기·지금 실행·고치기·삭제(2단계 확인) */
export default function RoutineRow({
  routine,
  runState,
  now,
  onToggle,
  onRun,
  onEdit,
  onDelete
}: RoutineRowProps) {
  const { t, locale } = useLocale()
  const labels = t.routine.row
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const { lastRun } = routine

  const formatWhen = (epochMs: number) =>
    `${formatMeetingDay({ epochMs, now, locale })} ${formatMeetingTime({ epochMs, locale })}`

  const nextRunAt = nextRoutineRunAt({ schedule: routine.schedule, after: routine.anchorAt })
  const lastRunText = !lastRun
    ? labels.neverRun
    : lastRun.error
      ? labels.lastRunFailed({ when: formatWhen(lastRun.finishedAt), reason: lastRun.error })
      : labels.lastRunDone({ when: formatWhen(lastRun.finishedAt) })
  const runLabel =
    runState === 'running' ? labels.running : runState === 'queued' ? labels.queued : labels.runNow

  return (
    <SettingRow
      title={routine.name}
      description={
        <>
          <span className={styles.line}>
            {summarizeSchedule({ schedule: routine.schedule, labels: t.routine.schedule })}
            {routine.isEnabled && Number.isFinite(nextRunAt)
              ? ` · ${labels.nextRun({ when: formatWhen(nextRunAt) })}`
              : null}
          </span>
          <span className={lastRun?.error ? styles.failed : styles.line}>{lastRunText}</span>
        </>
      }
      control={
        <Switch
          isChecked={routine.isEnabled}
          onChange={onToggle}
          ariaLabel={labels.toggle({ name: routine.name })}
        />
      }
    >
      <div className={styles.actions}>
        <Button variant="secondary" size="sm" onClick={onRun} disabled={runState !== 'idle'}>
          {runLabel}
        </Button>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          {labels.edit}
        </Button>
        {isConfirmingDelete ? (
          <>
            <Button variant="danger" size="sm" onClick={onDelete}>
              {labels.confirmDelete}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setIsConfirmingDelete(false)}>
              {labels.cancel}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setIsConfirmingDelete(true)}>
            {labels.delete}
          </Button>
        )}
      </div>
      {lastRun && (lastRun.text || lastRun.changedFiles.length) ? (
        <details className={styles.answer}>
          <summary>{labels.lastAnswer}</summary>
          <p className={styles.answerText}>{lastRun.text || labels.noAnswer}</p>
          {lastRun.changedFiles.length ? (
            <p className={styles.files}>
              {labels.changedFiles}: {lastRun.changedFiles.join(', ')}
            </p>
          ) : null}
        </details>
      ) : null}
    </SettingRow>
  )
}
