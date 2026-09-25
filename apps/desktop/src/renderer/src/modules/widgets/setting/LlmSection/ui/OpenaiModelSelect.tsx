import { useId } from 'react'
import type { OpenaiModelId } from '@shared/types'
import { isOpenaiModelId, OPENAI_MODEL_IDS } from '@shared/llm'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './OpenaiModelSelect.module.css'

interface OpenaiModelSelectProps {
  value: OpenaiModelId
  isDisabled: boolean
  onChange: (model: OpenaiModelId) => void
}

/** GPT-6 계열 셋 중 하나. 라디오를 또 쌓지 않고 select 하나로 둔다 (references/architecture.md "LLM 공급자" 화면) */
export default function OpenaiModelSelect({ value, isDisabled, onChange }: OpenaiModelSelectProps) {
  const { t } = useLocale()
  const selectId = useId()
  const selected = t.llm.openaiModels[value]

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={selectId}>
        {t.llm.openaiModelSelect.label}
      </label>
      <span className={styles.hint}>
        {selected?.description ?? t.llm.openaiModelSelect.fallbackDescription}.{' '}
        {t.llm.openaiModelSelect.appliesNext}
      </span>
      <select
        id={selectId}
        className={styles.select}
        value={value}
        disabled={isDisabled}
        onChange={(event) => {
          if (isOpenaiModelId(event.target.value)) onChange(event.target.value)
        }}
      >
        {OPENAI_MODEL_IDS.map((id) => (
          <option key={id} value={id}>
            {t.llm.openaiModels[id].title}
          </option>
        ))}
      </select>
    </div>
  )
}
