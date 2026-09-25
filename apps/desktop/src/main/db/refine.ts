import { readRefinePairs } from '@shared/refine'
import type { RefinePair, RefineResult } from '@shared/types'
import { getDb } from './connection'

interface RefineRow {
  refine_applied: string | null
  refined_at: number | null
}

/** 컬럼 하나가 깨져도 상세는 열려야 한다. 깨진 JSON은 없는 값으로 읽는다 */
const parseJson = (value: string | null): unknown => {
  if (!value) return null

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/** 상세에 함께 실리는 마지막 자동 교정 결과. 아직 교정하지 않았으면 null (references/data-model.md "자동 교정 결과 저장") */
export const getRefineResult = ({ meetingId }: { meetingId: string }): RefineResult | null => {
  const row = getDb()
    .prepare('SELECT refine_applied, refined_at FROM meetings WHERE id = ?')
    .get(meetingId) as RefineRow | undefined
  if (!row || row.refined_at === null) return null

  return { refinedAt: row.refined_at, appliedPairs: readRefinePairs(parseJson(row.refine_applied)) }
}

interface ApplyRefineResultParams {
  meetingId: string
  texts: { id: string; text: string }[]
  appliedPairs: RefinePair[]
  refinedAt: number
}

/** 교정으로 바뀐 발화 본문과 결과를 한 트랜잭션으로 저장한다. 결과는 통째로 덮어쓴다 */
export const applyRefineResult = ({
  meetingId,
  texts,
  appliedPairs,
  refinedAt
}: ApplyRefineResultParams) => {
  const db = getDb()
  const updateText = db.prepare(
    'UPDATE utterances SET text = @text WHERE id = @id AND meeting_id = @meetingId'
  )
  const saveResult = db.prepare(
    'UPDATE meetings SET refine_applied = @applied, refined_at = @refinedAt WHERE id = @meetingId'
  )

  db.transaction(() => {
    texts.forEach(({ id, text }) => updateText.run({ id, text, meetingId }))
    saveResult.run({
      meetingId,
      refinedAt,
      applied: appliedPairs.length ? JSON.stringify(appliedPairs) : null
    })
  })()
}
