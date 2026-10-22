import { useState } from 'react'
import type { RoutineProposal } from '@shared/routine'
import type { Routine, RoutineInput } from '@shared/types'
import { saveRoutineApi } from '@renderer/shared/api/routine'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useRoutines from '@renderer/shared/hooks/domain/routine/useRoutines'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { isRemoteError, remoteErrorMessageOf } from '@renderer/shared/utils/remoteError'
import { summarizeSchedule } from '@renderer/shared/utils/summarizeSchedule'

import styles from './RoutineProposalCard.module.css'

interface RoutineProposalCardProps {
  proposal: RoutineProposal
}

/** 채팅을 다시 그려도 두 번 추가하지 않도록, 같은 내용의 루틴이 이미 있으면 추가한 것으로 본다 */
const isSameRoutine = ({ routine, input }: { routine: Routine; input: RoutineInput }) =>
  routine.name === input.name &&
  routine.prompt === input.prompt &&
  JSON.stringify(routine.schedule) === JSON.stringify(input.schedule)

/**
 * 에이전트가 대화로 정한 루틴 제안 (references/features/assistant.md "루틴" > "대화로 만들기").
 * 저장은 사용자가 "루틴 추가"를 누를 때만 한다. 추가되면 `routines:changed`로 목록이 바뀌어 "추가했어요"가 된다.
 */
export default function RoutineProposalCard({ proposal }: RoutineProposalCardProps) {
  const { t } = useLocale()
  const labels = t.routine.proposal
  const { state } = useRoutines()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { input } = proposal

  // 스트리밍 중이라 블록이 아직 닫히지 않았다
  if (!input && !proposal.error) return null

  if (!input) {
    return (
      <p className={styles.error} role="alert">
        {labels.invalid({ reason: proposal.error ?? '' })}
      </p>
    )
  }

  const isAdded = state?.routines.some((routine) => isSameRoutine({ routine, input })) ?? false

  const handleAdd = async () => {
    setIsSaving(true)
    try {
      await saveRoutineApi(input)
      setError(null)
    } catch (caught) {
      setError(isRemoteError(caught) ? remoteErrorMessageOf(caught) : labels.saveError)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className={styles.card} aria-label={labels.title}>
      <div className={styles.header}>
        <strong className={styles.name}>{input.name}</strong>
        <span className={styles.schedule}>
          {summarizeSchedule({ schedule: input.schedule, labels: t.routine.schedule })}
        </span>
      </div>
      <p className={styles.prompt}>
        <span className={styles.label}>{labels.prompt}</span>
        {input.prompt}
      </p>
      {isAdded ? (
        <p className={styles.added} role="status">
          {labels.added}
        </p>
      ) : (
        <div className={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleAdd()}
            disabled={!state || isSaving}
          >
            {isSaving ? labels.adding : labels.add}
          </Button>
        </div>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
