import { useId } from 'react'
import Button from '@renderer/shared/components/primitives/ui/Button'

import styles from './ApiKeyField.module.css'

interface ApiKeyFieldProps {
  value: string
  hasSavedKey: boolean
  savedKeyTail: string | null
  isDisabled: boolean
  onChange: (value: string) => void
  onSave: () => void
  onClear: () => void
}

/** 키는 저장 후 입력란에서 지운다. 저장된 키는 유무와 마지막 4자만 보인다 (references/data-model.md) */
export default function ApiKeyField({
  value,
  hasSavedKey,
  savedKeyTail,
  isDisabled,
  onChange,
  onSave,
  onClear
}: ApiKeyFieldProps) {
  const inputId = useId()

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        Claude API 키
      </label>
      <span className={styles.hint}>
        {hasSavedKey
          ? `저장된 키가 있습니다 (…${savedKeyTail ?? ''}). 새 키를 저장하면 바꿉니다.`
          : 'Anthropic 콘솔(console.anthropic.com)에서 발급한 키를 붙여 넣으세요. 키는 이 기기에 암호화해 저장합니다.'}
      </span>
      <div className={styles.row}>
        <input
          id={inputId}
          className={styles.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          value={value}
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value.trim()) onSave()
          }}
        />
        <Button size="sm" onClick={onSave} disabled={isDisabled || !value.trim()}>
          저장
        </Button>
        {hasSavedKey && (
          <Button variant="secondary" size="sm" onClick={onClear} disabled={isDisabled}>
            키 삭제
          </Button>
        )}
      </div>
    </div>
  )
}
