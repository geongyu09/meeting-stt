import { countCorrections, CORRECTION_PROMOTE_COUNT } from '@shared/correction'
import { GLOSSARY_MAX_TERMS, mergeGlossaryTerms } from '@shared/glossary'

import {
  getCorrectionCounts,
  getGlossarySettings,
  setCorrectionCounts,
  updateGlossarySettings
} from '../db/settings'
import { info, warn } from '../log'

/**
 * 발화 인라인 편집 한 번의 바뀐 단어를 세고, 3회에 닿은 단어를 전역 용어 사전 끝에 붙인다
 * (references/architecture.md "교정 횟수로 용어 자동 등록")
 */
export const recordCorrection = ({ before, after }: { before: string; after: string }) => {
  const { counts, promoted } = countCorrections({ counts: getCorrectionCounts(), before, after })
  setCorrectionCounts(counts)
  if (!promoted.length) return

  const glossary = getGlossarySettings()
  const { terms, addedCount } = mergeGlossaryTerms({ current: glossary.terms, additions: promoted })
  if (!addedCount) return
  if (terms.length > GLOSSARY_MAX_TERMS) {
    warn(`용어 자동 등록 건너뜀 (목록 ${GLOSSARY_MAX_TERMS}줄 초과): ${promoted.join(', ')}`)
    return
  }

  updateGlossarySettings({ ...glossary, terms })
  info(`교정 ${CORRECTION_PROMOTE_COUNT}회로 용어 자동 등록: ${promoted.join(', ')}`)
}
