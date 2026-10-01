/**
 * 요약 템플릿의 순수 로직 — 블록 카탈로그, 형식 문자열 컴파일, 저장 검증, 결과 미리보기.
 * 사용자는 프롬프트를 쓰지 않는다. 블록마다 검증된 지시문 조각을 여기 두고 쌓은 순서대로 이어 붙인다
 * (references/architecture.md "요약 템플릿"). DB·IPC는 호출하는 쪽이 담당한다.
 */

import { summaryTemplateKo } from './locales/summaryTemplate'
import type { SummaryBlock, SummaryBlockKind, SummaryTemplate } from './types'

/** 검증 오류 문구. 기본은 한국어 사전이고 main은 현재 언어의 `t().summaryTemplate.errors`를 넘긴다 */
export type SummaryTemplateErrorMessages = typeof summaryTemplateKo.errors

export const SUMMARY_TEMPLATE_NAME_MAX_CHARS = 30
export const SUMMARY_TEMPLATE_MAX_COUNT = 20
export const SUMMARY_TEMPLATE_MAX_BLOCKS = 10
export const SUMMARY_BLOCK_HEADING_MAX_CHARS = 30
export const SUMMARY_BLOCK_DESCRIPTION_MAX_CHARS = 100

/** 잠정값. `scripts/summarize.ts --template`로 측정한 뒤 고친다 */
export const LOCAL_MANY_BLOCKS_THRESHOLD = 6

export const DEFAULT_SUMMARY_TEMPLATE_ID = 'default'

/**
 * 긴 회의의 구간 요약(map)에서 모아 둘 재료. 모으지 않은 재료는 합치기(reduce)에서 만들 수 없다.
 * 블록이 아니라 재료로 두는 이유는 같은 재료를 쓰는 블록이 여럿이라 구간 요약이 부풀지 않게 하기 위해서다.
 * 순서가 구간 요약 형식의 순서다.
 */
const MATERIAL_FORMATS = {
  discussion: ['## 논의', '- (이 구간에서 다룬 주제와 결론)'],
  remarks: [
    '## 발언',
    '- (화자마다 이 구간에서 낸 주요 의견. "화자 1" 같은 번호 라벨은 그대로 쓴다)'
  ],
  decisions: ['## 결정', '- (이 구간에서 확정된 것만. 없으면 "없음")'],
  actions: [
    '## 할 일',
    '- (할 일 하나에 한 줄. 이름이 분명히 나온 경우에만 "이름: "을 앞에 붙인다. 없으면 "없음")'
  ],
  open: ['## 미해결', '- (결론이 나지 않았거나 다음으로 미룬 것. 없으면 "없음")'],
  numbers: ['## 숫자', '- (이 구간에 나온 수치·날짜·일정을 원문 그대로. 없으면 "없음")'],
  quotes: ['## 인용', '- (핵심 발언을 원문 그대로 "화자: 발언" 형식으로 3개 이내)']
} satisfies Record<string, string[]>

type Material = keyof typeof MATERIAL_FORMATS

const MATERIAL_ORDER = Object.keys(MATERIAL_FORMATS) as Material[]

interface BlockCatalogEntry {
  heading: string
  /** 최종 형식에서 제목 아래 `- (…)`로 들어가는 지시. custom은 사용자 설명이 대신한다 */
  finalInstruction: string
  material: Material
}

/**
 * 기본 제목과 지시문은 UI 언어와 무관하게 한국어다 — 요약 언어는 UI 언어가 아니다.
 * overview·decisions·actions의 지시문은 측정을 거친 기존 형식 그대로다 (docs/phase5-results.md).
 */
const BLOCK_CATALOG: Record<SummaryBlockKind, BlockCatalogEntry> = {
  oneLine: {
    heading: '한 줄 요약',
    finalInstruction: '회의 전체를 한 문장으로',
    material: 'discussion'
  },
  overview: {
    heading: '핵심 요약',
    finalInstruction: '가장 중요한 것부터 5개 이내, 한 줄에 하나',
    material: 'discussion'
  },
  topics: {
    heading: '논의 사항',
    finalInstruction: '주제마다 한 줄: 무엇을 논의했고 결론이 무엇인지',
    material: 'discussion'
  },
  speakers: {
    heading: '참석자별 발언',
    finalInstruction:
      '회의록에 나온 화자마다 한 줄에 주요 의견. "화자 1" 같은 번호 라벨은 그대로 쓰고 이름을 지어내지 않는다',
    material: 'remarks'
  },
  decisions: {
    heading: '결정 사항',
    finalInstruction: '회의에서 확정된 것만 5개 이내. 없으면 "없음"',
    material: 'decisions'
  },
  actions: {
    heading: '다음 할 일',
    finalInstruction:
      '할 일 하나에 한 줄, 5개 이내. 이름이 회의록에 분명히 나온 경우에만 "이름: "을 앞에 붙이고, 아니면 할 일만 적는다. 기한도 회의록에 나온 경우에만 덧붙인다. 없으면 "없음"',
    material: 'actions'
  },
  openQuestions: {
    heading: '미해결 · 보류',
    finalInstruction: '결론이 나지 않았거나 다음으로 미룬 것. 없으면 "없음"',
    material: 'open'
  },
  numbers: {
    heading: '숫자 · 일정',
    finalInstruction:
      '회의록에 나온 수치·날짜·일정을 원문 그대로. 계산하거나 추정하지 않는다. 없으면 "없음"',
    material: 'numbers'
  },
  quotes: {
    heading: '주요 발언',
    finalInstruction: '핵심 발언 3개 이내를 원문 그대로 인용하고 화자 이름을 앞에 붙인다',
    material: 'quotes'
  },
  custom: { heading: '추가 항목', finalInstruction: '', material: 'discussion' }
}

/** 블록 모음에 보이는 순서 */
export const SUMMARY_BLOCK_KINDS = Object.keys(BLOCK_CATALOG) as SummaryBlockKind[]

export const isSummaryBlockKind = (value: unknown): value is SummaryBlockKind =>
  typeof value === 'string' && (SUMMARY_BLOCK_KINDS as string[]).includes(value)

/** custom만 여러 번 넣을 수 있다 */
export const isRepeatableBlockKind = (kind: SummaryBlockKind) => kind === 'custom'

/**
 * @description 블록 모음에서 고른 종류의 새 블록을 만듭니다. 제목은 카탈로그의 기본 제목입니다.
 * @param kind - 블록 종류
 * @returns 새 블록. custom은 빈 설명을 가집니다
 * @example
 * const block = createSummaryBlock('decisions') // { kind: 'decisions', heading: '결정 사항' }
 */
export const createSummaryBlock = (kind: SummaryBlockKind): SummaryBlock =>
  kind === 'custom'
    ? { kind, heading: BLOCK_CATALOG.custom.heading, description: '' }
    : { kind, heading: BLOCK_CATALOG[kind].heading }

/** 코드에 내장된 기본 템플릿. DB에 넣지 않고 고치거나 지울 수 없다 */
export const DEFAULT_SUMMARY_TEMPLATE: SummaryTemplate = {
  id: DEFAULT_SUMMARY_TEMPLATE_ID,
  name: summaryTemplateKo.defaultName,
  blocks: (['overview', 'decisions', 'actions'] as const).map(createSummaryBlock),
  isBuiltIn: true
}

const instructionOf = ({ kind, description }: SummaryBlock) =>
  kind === 'custom' ? (description ?? '').trim() : BLOCK_CATALOG[kind].finalInstruction

/**
 * @description 쌓은 블록을 요약 프롬프트에 넣을 형식 문자열로 이어 붙입니다.
 * @param blocks - 위에서부터 쌓은 블록
 * @returns finalFormat(최종·합치기 형식), chunkFormat(긴 회의의 구간 요약 형식), headings(결과 검증용 제목)
 * @example
 * const { finalFormat, chunkFormat } = compileTemplate({ blocks: DEFAULT_SUMMARY_TEMPLATE.blocks })
 */
export const compileTemplate = ({ blocks }: { blocks: SummaryBlock[] }) => {
  const finalFormat = blocks
    .map((block) => `## ${block.heading.trim()}\n- (${instructionOf(block)})`)
    .join('\n\n')

  const materials = new Set(blocks.map(({ kind }) => BLOCK_CATALOG[kind].material))
  const chunkFormat = MATERIAL_ORDER.filter((material) => materials.has(material))
    .map((material) => MATERIAL_FORMATS[material].join('\n'))
    .join('\n\n')

  return { finalFormat, chunkFormat, headings: blocks.map(({ heading }) => heading.trim()) }
}

/**
 * @description 결과 모양을 보여 주는 뼈대를 만듭니다. AI에게 보내는 지시문이 아닙니다.
 * @param blocks - 위에서부터 쌓은 블록
 * @returns `## 제목\n- …`을 이어 붙인 문자열
 * @example
 * const preview = buildTemplatePreview({ blocks })
 */
export const buildTemplatePreview = ({ blocks }: { blocks: SummaryBlock[] }) =>
  blocks.map(({ heading }) => `## ${heading.trim()}\n- …`).join('\n\n')

/**
 * @description 요약 결과에서 빠진 블록 제목을 찾습니다. 모델이 형식을 놓쳤는지 로그로 남기는 데 씁니다.
 * @param summary - 요약 결과
 * @param headings - `compileTemplate`의 headings
 * @returns 결과에 `## <제목>` 줄이 없는 제목 목록
 * @example
 * const missing = findMissingHeadings({ summary, headings })
 */
export const findMissingHeadings = ({
  summary,
  headings
}: {
  summary: string
  headings: string[]
}) => {
  const lines = new Set(summary.split('\n').map((line) => line.trim()))
  return headings.filter((heading) => !lines.has(`## ${heading}`))
}

const LINE_BREAK = /[\r\n]/
const HEADING_FORBIDDEN = /[\r\n#]/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

interface ProblemParams {
  errors: SummaryTemplateErrorMessages
}

const headingProblem = ({ heading, errors }: ProblemParams & { heading: string }) => {
  const trimmed = heading.trim()
  if (!trimmed) return errors.emptyHeading
  if (trimmed.length > SUMMARY_BLOCK_HEADING_MAX_CHARS) {
    return errors.headingTooLong({ max: SUMMARY_BLOCK_HEADING_MAX_CHARS })
  }
  if (HEADING_FORBIDDEN.test(trimmed)) return errors.invalidHeading

  return null
}

const descriptionProblem = ({ description, errors }: ProblemParams & { description: string }) => {
  const trimmed = description.trim()
  if (!trimmed) return errors.emptyDescription
  if (trimmed.length > SUMMARY_BLOCK_DESCRIPTION_MAX_CHARS) {
    return errors.descriptionTooLong({ max: SUMMARY_BLOCK_DESCRIPTION_MAX_CHARS })
  }
  if (LINE_BREAK.test(trimmed)) return errors.invalidDescription

  return null
}

const blockProblem = ({ block, errors }: ProblemParams & { block: SummaryBlock }) =>
  headingProblem({ heading: block.heading, errors }) ??
  (block.kind === 'custom'
    ? descriptionProblem({ description: block.description ?? '', errors })
    : null)

interface SummaryTemplateProblemParams {
  name: string
  blocks: SummaryBlock[]
  errors?: SummaryTemplateErrorMessages
  /** 블록 이름을 오류 문구에 넣을 때 쓴다. 생략하면 한국어 이름 */
  blockNames?: Record<SummaryBlockKind, { name: string }>
}

/**
 * @description 템플릿 하나의 저장 제약을 확인합니다. 이름 중복·템플릿 수는 DB가 필요해 main이 따로 확인합니다.
 * @param name - 템플릿 이름
 * @param blocks - 쌓은 블록
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @returns 첫 번째 문제의 안내 문구. 문제가 없으면 null
 * @example
 * const problem = summaryTemplateProblem({ name, blocks })
 */
export const summaryTemplateProblem = ({
  name,
  blocks,
  errors = summaryTemplateKo.errors,
  blockNames = summaryTemplateKo.blocks
}: SummaryTemplateProblemParams) => {
  const trimmedName = name.trim()
  if (!trimmedName) return errors.emptyName
  if (trimmedName.length > SUMMARY_TEMPLATE_NAME_MAX_CHARS) {
    return errors.nameTooLong({ max: SUMMARY_TEMPLATE_NAME_MAX_CHARS })
  }
  if (!blocks.length) return errors.noBlocks
  if (blocks.length > SUMMARY_TEMPLATE_MAX_BLOCKS) {
    return errors.tooManyBlocks({ max: SUMMARY_TEMPLATE_MAX_BLOCKS })
  }

  const duplicate = blocks.find(
    ({ kind }, index) =>
      !isRepeatableBlockKind(kind) && blocks.findIndex((other) => other.kind === kind) !== index
  )
  if (duplicate) return errors.duplicateBlock({ name: blockNames[duplicate.kind].name })

  return blocks.map((block) => blockProblem({ block, errors })).find(Boolean) ?? null
}

/** 모르는 kind·깨진 모양의 블록은 null. DB와 IPC 양쪽에서 쓴다 */
const readBlock = (value: unknown): SummaryBlock | null => {
  if (!isRecord(value) || !isSummaryBlockKind(value.kind) || typeof value.heading !== 'string') {
    return null
  }
  if (value.kind !== 'custom') return { kind: value.kind, heading: value.heading.trim() }
  if (typeof value.description !== 'string') return null

  return { kind: value.kind, heading: value.heading.trim(), description: value.description.trim() }
}

/**
 * @description DB에 저장된 블록 JSON을 좁힙니다. 모르는 kind(새 버전에서 만든 블록 등)는 버립니다.
 * @param value - `JSON.parse`한 blocks 컬럼
 * @returns 읽을 수 있는 블록만 남긴 배열. 배열이 아니면 빈 배열
 * @example
 * const blocks = readStoredBlocks(JSON.parse(row.blocks))
 */
export const readStoredBlocks = (value: unknown) =>
  Array.isArray(value)
    ? value.map(readBlock).filter((block): block is SummaryBlock => block !== null)
    : []

export interface SummaryTemplateDraft {
  id?: string
  name: string
  blocks: SummaryBlock[]
}

/**
 * @description renderer가 보낸 템플릿 저장 요청을 검증하고 정리합니다.
 * @param payload - 요청 payload (`{ id?, name, blocks }`)
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @param blockNames - 블록 이름 사전. 생략하면 한국어
 * @returns 정리한 저장 요청
 * @example
 * const draft = readSummaryTemplateDraft(payload)
 */
export const readSummaryTemplateDraft = (
  payload: unknown,
  errors: SummaryTemplateErrorMessages = summaryTemplateKo.errors,
  blockNames: Record<SummaryBlockKind, { name: string }> = summaryTemplateKo.blocks
): SummaryTemplateDraft => {
  if (!isRecord(payload) || typeof payload.name !== 'string' || !Array.isArray(payload.blocks)) {
    throw new Error(errors.invalidRequest)
  }
  if (payload.id !== undefined && typeof payload.id !== 'string') {
    throw new Error(errors.invalidRequest)
  }

  const blocks = payload.blocks.map(readBlock)
  if (blocks.some((block) => block === null)) throw new Error(errors.invalidRequest)

  const draft = {
    ...(payload.id ? { id: payload.id } : {}),
    name: payload.name.trim(),
    blocks: blocks as SummaryBlock[]
  }
  const problem = summaryTemplateProblem({ ...draft, errors, blockNames })
  if (problem) throw new Error(problem)

  return draft
}
