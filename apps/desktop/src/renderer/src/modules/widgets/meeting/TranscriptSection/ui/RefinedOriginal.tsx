import { useId, useState } from 'react'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './RefinedOriginal.module.css'

interface RefinedOriginalProps {
  originalText: string
  onRevert: () => void
}

/**
 * 자동 교정이 바꾼 발화의 "교정됨" 표시. 누르면 교정 전 원문과 되돌리기 버튼을 펼친다.
 * 되돌린 뒤에도 "다시 교정"으로 되살릴 수 있어 2단계 확인을 두지 않는다 (references/architecture.md "회의록 교정")
 */
export default function RefinedOriginal({ originalText, onRevert }: RefinedOriginalProps) {
  const { t } = useLocale()
  const labels = t.transcript.utterance
  const panelId = useId()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={isOpen ? labels.hideOriginal : labels.showOriginal}
        title={isOpen ? labels.hideOriginal : labels.showOriginal}
        onClick={() => setIsOpen((current) => !current)}
      >
        {labels.refined}
        <span className={isOpen ? styles.chevronOpen : styles.chevron}>
          <Icon name="chevronDown" size={12} />
        </span>
      </button>
      {isOpen && (
        <div id={panelId} className={styles.panel}>
          <p className={styles.label}>{labels.originalLabel}</p>
          <p className={styles.original}>{originalText}</p>
          <div className={styles.actions}>
            <Button variant="secondary" size="sm" onClick={onRevert}>
              {labels.revert}
            </Button>
            <span className={styles.hint}>{labels.revertHint}</span>
          </div>
        </div>
      )}
    </div>
  )
}
