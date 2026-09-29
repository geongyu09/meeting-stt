import { useId } from 'react'
import type { CodexModelOption } from '@shared/types'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './CodexModelSelect.module.css'

/** select의 value는 문자열이라 "CLI 기본 모델"(null)을 빈 문자열로 둔다 */
const DEFAULT_OPTION_VALUE = ''

interface CodexModelSelectProps {
  /** null이면 CLI 기본 모델 */
  value: string | null
  options: CodexModelOption[]
  isDisabled: boolean
  onChange: (model: string | null) => void
}

/**
 * 구독 계정으로 쓸 수 있는 Codex 모델 중 하나. 목록은 CLI 카탈로그에서 오고, 저장한 모델이 목록에서
 * 사라져도 선택지에 남겨 둔다 (references/architecture.md "Codex CLI 호출")
 */
export default function CodexModelSelect({
  value,
  options,
  isDisabled,
  onChange
}: CodexModelSelectProps) {
  const { t } = useLocale()
  const copy = t.llm.codexModelSelect
  const selectId = useId()
  const selected = options.find((option) => option.id === value)
  const isUnlisted = value !== null && !selected
  const description = value === null ? copy.defaultDescription : selected?.description

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={selectId}>
        {copy.label}
      </label>
      <span className={styles.hint}>
        {description ? `${description}. ` : ''}
        {options.length ? copy.appliesNext : copy.emptyHint}
      </span>
      <select
        id={selectId}
        className={styles.select}
        value={value ?? DEFAULT_OPTION_VALUE}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value={DEFAULT_OPTION_VALUE}>{copy.defaultOption}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        {isUnlisted && (
          <option value={value}>
            {value}
            {copy.unlistedSuffix}
          </option>
        )}
      </select>
    </div>
  )
}
