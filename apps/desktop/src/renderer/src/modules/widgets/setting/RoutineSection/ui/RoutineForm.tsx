import { useState, type FormEvent } from 'react'
import { ROUTINE_NAME_MAX_CHARS } from '@shared/routine'
import type { Routine, RoutineInput } from '@shared/types'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { isRemoteError, remoteErrorMessageOf } from '@renderer/shared/utils/remoteError'

import type { RoutineFormValues } from '../types/routineForm'
import { formValuesOf, scheduleOf } from '../utils/routineSchedule'
import ScheduleFields from './ScheduleFields'
import styles from './RoutineForm.module.css'

interface RoutineFormProps {
  /** 고칠 루틴. 새로 만들면 null */
  routine: Routine | null
  /** 실패하면 던진다. 폼이 main의 안내 문구를 보여 준다 */
  onSave: (input: RoutineInput) => Promise<void>
  onCancel: () => void
}

/** 루틴 만들기·고치기 인라인 폼. 저장에 성공하면 부모가 닫는다 */
export default function RoutineForm({ routine, onSave, onCancel }: RoutineFormProps) {
  const { t } = useLocale()
  const labels = t.routine.form
  const [values, setValues] = useState(() => formValuesOf(routine))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const update = (patch: Partial<RoutineFormValues>) =>
    setValues((current) => ({ ...current, ...patch }))

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    try {
      await onSave({
        id: routine?.id ?? null,
        name: values.name,
        prompt: values.prompt,
        schedule: scheduleOf(values),
        isEnabled: routine?.isEnabled ?? true
      })
    } catch (caught) {
      setError(isRemoteError(caught) ? remoteErrorMessageOf(caught) : labels.saveError)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      className={styles.form}
      aria-label={routine ? labels.editTitle : labels.newTitle}
      onSubmit={handleSubmit}
    >
      <label className={styles.field}>
        <span className={styles.label}>{labels.name}</span>
        <input
          className={styles.input}
          value={values.name}
          maxLength={ROUTINE_NAME_MAX_CHARS}
          placeholder={labels.namePlaceholder}
          onChange={(event) => update({ name: event.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{labels.prompt}</span>
        <textarea
          className={`${styles.input} ${styles.prompt}`}
          rows={4}
          value={values.prompt}
          placeholder={labels.promptPlaceholder}
          onChange={(event) => update({ prompt: event.target.value })}
        />
      </label>
      <ScheduleFields values={values} onChange={update} />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {labels.cancel}
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={isSaving}>
          {labels.save}
        </Button>
      </div>
    </form>
  )
}
