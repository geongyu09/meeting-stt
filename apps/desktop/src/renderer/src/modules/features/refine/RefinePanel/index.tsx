import { Link } from 'react-router'
import { llmMissingMessage } from '@shared/llm'
import { groupRefinePairs } from '@shared/refine'
import type { RefineResult } from '@shared/types'
import Button from '@renderer/shared/components/primitives/ui/Button'
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

/**
 * 상세 오른쪽 레일의 교정 패널. 교정은 파이프라인 뒤에 자동으로 돌아 본문에 바로 반영되므로,
 * 여기서는 무엇을 몇 곳 고쳤는지 보여 주고 용어 사전을 고친 뒤 다시 돌리는 버튼만 둔다
 * (references/architecture.md "회의록 교정"). 잘못 고친 곳은 발화 인라인 편집으로 되돌린다.
 */
export default function RefinePanel({ meetingId, refineResult }: RefinePanelProps) {
  const { t } = useLocale()
  const { stage, percent, error, isRunning, runRefine } = useRefine({ meetingId })
  const { status: llmStatus } = useLlmStatus()
  const { glossary } = useGlossary()

  const groups = groupRefinePairs({ pairs: refineResult?.appliedPairs ?? [] })
  const globalTermCount = glossary?.terms.length ?? 0
  // 상태를 아직 모르면 막지 않는다. 준비 문구는 main과 같은 함수로 만든다 (references/architecture.md "LLM 공급자")
  const missingMessage = llmStatus ? llmMissingMessage(llmStatus, t.llm) : null
  const providerLabel = llmStatus ? t.llm.providerLabels[llmStatus.provider] : ''
  const isRunBlocked = isRunning || globalTermCount === 0 || missingMessage !== null

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
    if (globalTermCount === 0) {
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

    return <p className={styles.message}>{t.refine.applied({ termCount: globalTermCount })}</p>
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
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            className={styles.action}
            disabled={isRunBlocked}
            onClick={runRefine}
          >
            {t.refine.rerun}
          </Button>
        </div>
      </>
    )
  }

  return (
    <section className={styles.section} aria-label={t.refine.sectionLabel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t.refine.title}</h2>
        <span className={styles.caption}>{caption}</span>
      </header>
      <div className={styles.body}>
        {renderBody()}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </section>
  )
}
