import { useId, useState } from 'react'
import { Link } from 'react-router'
import { llmMissingMessage } from '@shared/llm'
import { groupRefinePairs } from '@shared/refine'
import type { RefineResult } from '@shared/types'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import useGlossary from '@renderer/shared/hooks/domain/glossary/useGlossary'
import useLlmStatus from '@renderer/shared/hooks/domain/llm/useLlmStatus'
import useRefine from '@renderer/shared/hooks/domain/refine/useRefine'
import { PATHS } from '@renderer/shared/routes/paths'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import PairGroupRow from './ui/PairGroupRow'
import styles from './index.module.css'

interface RefinePanelProps {
  meetingId: string
  /** 마지막 자동 교정 결과. 상세의 일부라 부모(`useMeeting`)가 든다 */
  refineResult: RefineResult | null
}

const CHEVRON_SIZE = 14

/**
 * 상세 오른쪽 레일의 교정 패널. 교정은 파이프라인 뒤에 자동으로 돌아 본문에 바로 반영되므로,
 * 여기서는 무엇을 몇 곳 고쳤는지 보여 주고 다시 돌리는 버튼만 둔다. 로컬은 용어 교정이라 용어 사전이 필요하고,
 * 외부 공급자는 문장 교정이라 용어 없이도 돈다 (references/architecture.md "회의록 교정").
 * 잘못 고친 곳은 발화의 "교정됨" 표시에서 원문으로 되돌린다.
 */
export default function RefinePanel({ meetingId, refineResult }: RefinePanelProps) {
  const { t } = useLocale()
  const { stage, percent, error, isRunning, runRefine } = useRefine({ meetingId })
  const { status: llmStatus } = useLlmStatus()
  const { glossary } = useGlossary()
  const [isExpanded, setIsExpanded] = useState(true)
  const bodyId = useId()

  const groups = groupRefinePairs({ pairs: refineResult?.appliedPairs ?? [] })
  const globalTermCount = glossary?.terms.length ?? 0
  // 상태를 아직 모르면 막지 않는다. 준비 문구는 main과 같은 함수로 만든다 (references/architecture.md "LLM 공급자")
  const missingMessage = llmStatus ? llmMissingMessage(llmStatus, t.llm) : null
  const providerLabel = llmStatus ? t.llm.providerLabels[llmStatus.provider] : ''
  const isLocal = llmStatus?.provider === 'local'
  const isMissingTerms = isLocal && globalTermCount === 0
  const isRunBlocked = isRunning || isMissingTerms || missingMessage !== null

  const caption = (() => {
    if (isRunning) return t.refine.runningCaption({ percent })
    if (groups.length) return t.refine.groupCountCaption({ count: groups.length })
    return providerLabel
  })()

  const renderGuide = () => {
    if (missingMessage) {
      return (
        <p className={styles.message}>
          {missingMessage}.{' '}
          <Link className={styles.link} to={PATHS.settings}>
            {t.refine.prepareInSettings}
          </Link>
        </p>
      )
    }
    if (isMissingTerms) {
      return (
        <p className={styles.message}>
          <Link className={styles.link} to={PATHS.settings}>
            {t.refine.noTermsLink}
          </Link>
          {t.refine.noTermsAfter}
        </p>
      )
    }
    if (!refineResult) {
      return <p className={styles.message}>{t.refine.notRefined}</p>
    }
    if (!groups.length) {
      return <p className={styles.message}>{t.refine.nothingFound}</p>
    }

    return (
      <p className={styles.message}>
        {isLocal ? t.refine.applied({ termCount: globalTermCount }) : t.refine.appliedSentence}
      </p>
    )
  }

  const renderBody = () => {
    if (isRunning) {
      return (
        <div className={styles.pending}>
          <p className={styles.message}>{stage ? t.refine.stages[stage] : ''}</p>
          <ProgressBar percent={percent} label={t.refine.progressLabel} />
        </div>
      )
    }

    return (
      <>
        {groups.length ? (
          <ul className={styles.list} aria-label={t.refine.listLabel}>
            {groups.map((group) => (
              <PairGroupRow key={`${group.from}→${group.to}`} group={group} />
            ))}
          </ul>
        ) : null}
        {renderGuide()}
        {isLocal && !missingMessage ? <p className={styles.message}>{t.refine.localHint}</p> : null}
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            className={styles.action}
            disabled={isRunBlocked}
            onClick={() => runRefine({ initialStage: isLocal ? 'read' : 'sentence' })}
          >
            {t.refine.rerun}
          </Button>
        </div>
      </>
    )
  }

  return (
    <section className={styles.section} aria-label={t.refine.sectionLabel}>
      {/* 요약 카드와 같이 헤더 전체가 접기 버튼이다. 캡션은 접힌 채로도 진행률·고친 수를 알려 준다 */}
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={isExpanded}
        aria-controls={bodyId}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={styles.chevron}>
          <Icon name="chevronDown" size={CHEVRON_SIZE} />
        </span>
        <span className={styles.titleContainer}>
          <h2 className={styles.title}>{t.refine.title}</h2>
          {caption && <span className={styles.caption}>{caption}</span>}
        </span>
      </button>
      {isExpanded && (
        <div id={bodyId} className={styles.body}>
          {renderBody()}
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}
    </section>
  )
}
