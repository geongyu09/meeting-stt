import { randomUUID } from 'node:crypto'
import {
  DEFAULT_SUMMARY_TEMPLATE,
  DEFAULT_SUMMARY_TEMPLATE_ID,
  readStoredBlocks,
  SUMMARY_TEMPLATE_MAX_COUNT,
  type SummaryTemplateDraft
} from '@shared/summaryTemplate'
import type { SummaryTemplate } from '@shared/types'

import { t } from '../locale'
import { warn } from '../log'
import { getDb } from './connection'

interface SummaryTemplateRow {
  id: string
  name: string
  blocks: string
}

const parseBlocks = (row: SummaryTemplateRow) => {
  try {
    return readStoredBlocks(JSON.parse(row.blocks) as unknown)
  } catch (caught) {
    warn(`요약 템플릿 ${row.id}의 블록 JSON을 읽지 못했습니다: ${String(caught)}`)
    return []
  }
}

/** 블록이 하나도 남지 않은 행은 목록에서 뺀다. 앱을 되돌린 뒤 다시 읽힐 수 있어 행은 지우지 않는다 */
const toTemplate = (row: SummaryTemplateRow): SummaryTemplate | null => {
  const blocks = parseBlocks(row)
  if (!blocks.length) return null

  return { id: row.id, name: row.name, blocks, isBuiltIn: false }
}

const listUserTemplates = () =>
  getDb()
    .prepare('SELECT id, name, blocks FROM summary_templates ORDER BY created_at')
    .all()
    .map((row) => toTemplate(row as SummaryTemplateRow))
    .filter((template): template is SummaryTemplate => template !== null)

/** 내장 기본 템플릿이 맨 앞, 나머지는 만든 순 (references/data-model.md "요약 템플릿 저장") */
export const listSummaryTemplates = () => [DEFAULT_SUMMARY_TEMPLATE, ...listUserTemplates()]

/** 없거나 읽을 수 없으면 null. 기본 템플릿 id는 코드 상수를 돌려준다 */
export const findSummaryTemplate = (id: string) => {
  if (id === DEFAULT_SUMMARY_TEMPLATE_ID) return DEFAULT_SUMMARY_TEMPLATE

  const row = getDb()
    .prepare('SELECT id, name, blocks FROM summary_templates WHERE id = ?')
    .get(id) as SummaryTemplateRow | undefined

  return row ? toTemplate(row) : null
}

const countRows = () =>
  (getDb().prepare('SELECT COUNT(*) AS count FROM summary_templates').get() as { count: number })
    .count

const hasRow = (id: string) =>
  Boolean(getDb().prepare('SELECT 1 FROM summary_templates WHERE id = ?').get(id))

/** 이름은 앞뒤 공백을 걷은 값으로 비교한다. 자기 자신은 빼고 본다 */
const isNameTaken = ({ name, exceptId }: { name: string; exceptId?: string }) =>
  Boolean(
    getDb()
      .prepare('SELECT 1 FROM summary_templates WHERE name = ? AND id != ?')
      .get(name, exceptId ?? '')
  )

const assertSavable = ({ id, name }: SummaryTemplateDraft) => {
  const errors = t().summaryTemplate.errors
  if (id === DEFAULT_SUMMARY_TEMPLATE_ID) throw new Error(errors.builtIn)
  if (id && !hasRow(id)) throw new Error(errors.notFound)
  if (!id && countRows() >= SUMMARY_TEMPLATE_MAX_COUNT) {
    throw new Error(errors.tooManyTemplates({ max: SUMMARY_TEMPLATE_MAX_COUNT }))
  }
  if (isNameTaken({ name, exceptId: id })) throw new Error(errors.duplicateName)
}

/**
 * 검증을 마친 초안을 저장하고 갱신된 목록을 돌려준다. id가 없으면 새로 만든다.
 * 블록 모양·길이 검증은 호출하는 쪽(`readSummaryTemplateDraft`)이 이미 했다.
 */
export const saveSummaryTemplate = (draft: SummaryTemplateDraft) => {
  assertSavable(draft)

  const now = Date.now()
  const blocks = JSON.stringify(draft.blocks)

  if (draft.id) {
    getDb()
      .prepare('UPDATE summary_templates SET name = ?, blocks = ?, updated_at = ? WHERE id = ?')
      .run(draft.name, blocks, now, draft.id)
  } else {
    getDb()
      .prepare(
        'INSERT INTO summary_templates (id, name, blocks, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(randomUUID(), draft.name, blocks, now, now)
  }

  return listSummaryTemplates()
}

/** 이미 만든 요약은 결과 텍스트만 저장하므로 템플릿을 지워도 그대로다 */
export const deleteSummaryTemplate = ({ id }: { id: string }) => {
  if (id === DEFAULT_SUMMARY_TEMPLATE_ID) throw new Error(t().summaryTemplate.errors.builtIn)

  getDb().prepare('DELETE FROM summary_templates WHERE id = ?').run(id)

  return listSummaryTemplates()
}
