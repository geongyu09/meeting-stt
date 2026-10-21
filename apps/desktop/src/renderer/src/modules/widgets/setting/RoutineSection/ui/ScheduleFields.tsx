import { useId } from 'react'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { IntervalUnit, RoutineFormValues } from '../types/routineForm'
import { WEEKDAY_DISPLAY_ORDER } from '../utils/routineSchedule'
import styles from './ScheduleFields.module.css'

type ScheduleValues = Pick<
  RoutineFormValues,
  'kind' | 'weekdays' | 'time' | 'intervalCount' | 'intervalUnit'
>

interface ScheduleFieldsProps {
  values: ScheduleValues
  onChange: (patch: Partial<ScheduleValues>) => void
}

const isIntervalUnit = (value: string): value is IntervalUnit =>
  value === 'minutes' || value === 'hours'

/** 주기 종류(시각/간격)와 그 입력칸. 요일은 월요일부터 토글 버튼으로 고른다 */
export default function ScheduleFields({ values, onChange }: ScheduleFieldsProps) {
  const { t } = useLocale()
  const labels = t.routine.form
  const kindName = useId()

  const handleToggleWeekday = (day: number) =>
    onChange({
      weekdays: values.weekdays.includes(day)
        ? values.weekdays.filter((weekday) => weekday !== day)
        : [...values.weekdays, day]
    })

  return (
    <>
      <fieldset className={styles.kinds}>
        <legend className={styles.label}>{labels.scheduleKind}</legend>
        <label className={styles.kind}>
          <input
            type="radio"
            name={kindName}
            checked={values.kind === 'time'}
            onChange={() => onChange({ kind: 'time' })}
          />
          {labels.kindTime}
        </label>
        <label className={styles.kind}>
          <input
            type="radio"
            name={kindName}
            checked={values.kind === 'interval'}
            onChange={() => onChange({ kind: 'interval' })}
          />
          {labels.kindInterval}
        </label>
      </fieldset>
      {values.kind === 'time' ? (
        <div className={styles.scheduleRow}>
          <div role="group" aria-label={labels.weekdays} className={styles.weekdays}>
            {WEEKDAY_DISPLAY_ORDER.map((day) => (
              <button
                key={day}
                type="button"
                className={styles.weekday}
                aria-pressed={values.weekdays.includes(day)}
                onClick={() => handleToggleWeekday(day)}
              >
                {t.routine.schedule.weekdayNames[day]}
              </button>
            ))}
          </div>
          <input
            type="time"
            className={styles.input}
            aria-label={labels.timeOfDay}
            value={values.time}
            onChange={(event) => onChange({ time: event.target.value })}
          />
        </div>
      ) : (
        <div className={styles.scheduleRow}>
          <input
            type="number"
            min={1}
            className={`${styles.input} ${styles.count}`}
            aria-label={labels.intervalCount}
            value={values.intervalCount}
            onChange={(event) => onChange({ intervalCount: event.target.value })}
          />
          <select
            className={styles.input}
            aria-label={labels.intervalUnit}
            value={values.intervalUnit}
            onChange={(event) => {
              if (isIntervalUnit(event.target.value)) onChange({ intervalUnit: event.target.value })
            }}
          >
            <option value="minutes">{labels.units.minutes}</option>
            <option value="hours">{labels.units.hours}</option>
          </select>
        </div>
      )}
    </>
  )
}
