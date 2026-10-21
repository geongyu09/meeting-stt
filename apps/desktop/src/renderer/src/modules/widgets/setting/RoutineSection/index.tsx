import { useState } from 'react'
import type { Routine, RoutineInput, RoutinesState } from '@shared/types'
import { deleteRoutineApi, runRoutineApi, saveRoutineApi } from '@renderer/shared/api/routine'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import SettingRow from '@renderer/shared/components/primitives/layout/SettingRow'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useNow from '@renderer/shared/hooks/common/useNow'
import useAssistantStatus from '@renderer/shared/hooks/domain/assistant/useAssistantStatus'
import useRoutines from '@renderer/shared/hooks/domain/routine/useRoutines'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { isRemoteError, remoteErrorMessageOf } from '@renderer/shared/utils/remoteError'

import type { RoutineRunState } from './types/routineForm'
import RoutineForm from './ui/RoutineForm'
import RoutineRow from './ui/RoutineRow'
import styles from './index.module.css'

/** 편집 중인 대상이 새 루틴임을 뜻한다. 루틴 id는 uuid라 겹치지 않는다 */
const NEW_ROUTINE = 'new'

/** "다음 실행 오늘/내일" 표기가 날짜를 넘길 때 바뀌도록 가끔 다시 그린다 */
const NOW_REFRESH_MS = 60_000

const inputOf = ({ id, name, prompt, schedule, isEnabled }: Routine): RoutineInput => ({
  id,
  name,
  prompt,
  schedule,
  isEnabled
})

/**
 * 설정의 "루틴" 묶음 — 주기마다 에이전트에게 프롬프트를 보내는 루틴 목록과 인라인 폼
 * (references/features/assistant.md "루틴" > "화면"). 실행 결과는 main이 push하는 상태로 갱신된다.
 */
export default function RoutineSection() {
  const { t } = useLocale()
  const labels = t.routine.settings
  const { status } = useAssistantStatus()
  const { state, error, applyState } = useRoutines()
  const { now } = useNow({ intervalMs: NOW_REFRESH_MS })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const runAction = async (action: () => Promise<RoutinesState>) => {
    try {
      applyState(await action())
      setActionError(null)
    } catch (caught) {
      setActionError(isRemoteError(caught) ? remoteErrorMessageOf(caught) : labels.actionError)
    }
  }

  const handleSave = async (input: RoutineInput) => {
    applyState(await saveRoutineApi(input))
    setEditingId(null)
  }

  const runStateOf = (id: string): RoutineRunState =>
    state?.runningId === id ? 'running' : state?.queuedIds.includes(id) ? 'queued' : 'idle'

  const isFolderUnusable = status !== null && (!status.folder || status.folderProblem !== null)
  const isAdding = editingId === NEW_ROUTINE

  return (
    <SettingGroup title={labels.title}>
      <SettingRow
        title={labels.listTitle}
        description={
          <>
            <span className={styles.line}>{labels.description}</span>
            {isFolderUnusable ? (
              <span className={styles.warning} role="status">
                {labels.noFolder}
              </span>
            ) : null}
            {!state && !error ? <span className={styles.line}>{labels.loading}</span> : null}
            {error || actionError ? (
              <span className={styles.error} role="alert">
                {actionError ?? labels.loadError}
              </span>
            ) : null}
          </>
        }
        control={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditingId(NEW_ROUTINE)}
            disabled={!state || isAdding}
          >
            {labels.add}
          </Button>
        }
      >
        {isAdding ? (
          <RoutineForm routine={null} onSave={handleSave} onCancel={() => setEditingId(null)} />
        ) : null}
        {state && !state.routines.length && !isAdding ? (
          <p className={styles.empty}>{labels.empty}</p>
        ) : null}
      </SettingRow>
      {state?.routines.map((routine) =>
        editingId === routine.id ? (
          <div key={routine.id} className={styles.editing}>
            <RoutineForm
              routine={routine}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
            />
          </div>
        ) : (
          <RoutineRow
            key={routine.id}
            routine={routine}
            runState={runStateOf(routine.id)}
            now={now}
            onToggle={(isEnabled) =>
              runAction(() => saveRoutineApi({ ...inputOf(routine), isEnabled }))
            }
            onRun={() => runAction(() => runRoutineApi({ id: routine.id }))}
            onEdit={() => setEditingId(routine.id)}
            onDelete={() => runAction(() => deleteRoutineApi({ id: routine.id }))}
          />
        )
      )}
    </SettingGroup>
  )
}
