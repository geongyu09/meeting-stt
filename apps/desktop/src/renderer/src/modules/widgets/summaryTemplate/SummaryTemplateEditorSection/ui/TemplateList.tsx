import type { SummaryTemplate } from '@shared/types'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './TemplateList.module.css'

interface TemplateListProps {
  templates: SummaryTemplate[]
  /** 새로 만드는 중(아직 저장 안 함)이면 null */
  activeId: string | null
  canCreate: boolean
  onSelect: (template: SummaryTemplate) => void
  onCreate: () => void
}

/**
 * 기본 제공과 내 템플릿을 그룹으로 나누고, "새 템플릿"은 만든 결과가 들어갈 "내 템플릿" 끝에 둔다
 * (고를 대상과 만드는 동작을 같은 줄·같은 모양으로 두지 않기 위해서)
 */
export default function TemplateList({
  templates,
  activeId,
  canCreate,
  onSelect,
  onCreate
}: TemplateListProps) {
  const { t } = useLocale()
  const labels = t.summaryTemplate.section
  const builtInTemplates = templates.filter(({ isBuiltIn }) => isBuiltIn)
  const userTemplates = templates.filter(({ isBuiltIn }) => !isBuiltIn)

  const renderItem = (template: SummaryTemplate) => (
    <li key={template.id}>
      <button
        type="button"
        className={styles.item}
        aria-pressed={template.id === activeId}
        onClick={() => onSelect(template)}
      >
        <span className={styles.name}>
          {template.isBuiltIn ? t.summaryTemplate.defaultName : template.name}
        </span>
      </button>
    </li>
  )

  return (
    <nav className={styles.container} aria-label={labels.listLabel}>
      <div className={styles.group}>
        <span className={styles.groupLabel}>{labels.builtInGroup}</span>
        <ul className={styles.list}>{builtInTemplates.map(renderItem)}</ul>
      </div>
      <div className={styles.group}>
        <span className={styles.groupLabel}>{labels.userGroup}</span>
        <ul className={styles.list}>
          {userTemplates.map(renderItem)}
          <li>
            <button
              type="button"
              className={styles.addItem}
              onClick={onCreate}
              disabled={!canCreate}
            >
              <span aria-hidden="true">+</span>
              {labels.newTemplate}
            </button>
          </li>
        </ul>
      </div>
    </nav>
  )
}
