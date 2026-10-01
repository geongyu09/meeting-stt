import { describe, expect, it } from 'vitest'

import { summaryTemplateEn } from './locales/summaryTemplate'
import {
  buildTemplatePreview,
  compileTemplate,
  createSummaryBlock,
  DEFAULT_SUMMARY_TEMPLATE,
  findMissingHeadings,
  readStoredBlocks,
  readSummaryTemplateDraft,
  SUMMARY_BLOCK_KINDS,
  SUMMARY_TEMPLATE_MAX_BLOCKS,
  summaryTemplateProblem
} from './summaryTemplate'
import type { SummaryBlock } from './types'

/** 요약 템플릿 이전의 형식. 측정(docs/phase5-results.md)을 거친 문자열이라 글자 하나도 바뀌면 안 된다 */
const LEGACY_FINAL_FORMAT = [
  '## 핵심 요약',
  '- (가장 중요한 것부터 5개 이내, 한 줄에 하나)',
  '',
  '## 결정 사항',
  '- (회의에서 확정된 것만 5개 이내. 없으면 "없음")',
  '',
  '## 다음 할 일',
  '- (할 일 하나에 한 줄, 5개 이내. 이름이 회의록에 분명히 나온 경우에만 "이름: "을 앞에 붙이고, 아니면 할 일만 적는다. 기한도 회의록에 나온 경우에만 덧붙인다. 없으면 "없음")'
].join('\n')

const LEGACY_CHUNK_FORMAT = [
  '## 논의',
  '- (이 구간에서 다룬 주제와 결론)',
  '',
  '## 결정',
  '- (이 구간에서 확정된 것만. 없으면 "없음")',
  '',
  '## 할 일',
  '- (할 일 하나에 한 줄. 이름이 분명히 나온 경우에만 "이름: "을 앞에 붙인다. 없으면 "없음")'
].join('\n')

const custom = (description: string, heading = '다음 안건'): SummaryBlock => ({
  kind: 'custom',
  heading,
  description
})

describe('compileTemplate', () => {
  it('기본 템플릿은 기존 형식과 글자 하나 다르지 않다', () => {
    const { finalFormat, chunkFormat, headings } = compileTemplate({
      blocks: DEFAULT_SUMMARY_TEMPLATE.blocks
    })

    expect(finalFormat).toBe(LEGACY_FINAL_FORMAT)
    expect(chunkFormat).toBe(LEGACY_CHUNK_FORMAT)
    expect(headings).toEqual(['핵심 요약', '결정 사항', '다음 할 일'])
  })

  it('쌓은 순서대로 바꾼 제목을 찍는다', () => {
    const { finalFormat } = compileTemplate({
      blocks: [
        { kind: 'decisions', heading: '확정' },
        { kind: 'oneLine', heading: '한 줄' }
      ]
    })

    expect(finalFormat.indexOf('## 확정')).toBeLessThan(finalFormat.indexOf('## 한 줄'))
    expect(finalFormat).not.toContain('결정 사항')
  })

  it('구간 요약 재료는 중복 없이 고정 순서로 모은다', () => {
    const { chunkFormat } = compileTemplate({
      blocks: [
        createSummaryBlock('quotes'),
        createSummaryBlock('oneLine'),
        createSummaryBlock('topics'),
        createSummaryBlock('overview')
      ]
    })

    expect(chunkFormat.match(/## 논의/g)).toHaveLength(1)
    expect(chunkFormat.indexOf('## 논의')).toBeLessThan(chunkFormat.indexOf('## 인용'))
    expect(chunkFormat).not.toContain('## 결정')
  })

  it('custom 블록은 사용자 설명을 지시로 감싼다', () => {
    const { finalFormat } = compileTemplate({ blocks: [custom('다음 회의에서 다룰 것')] })

    expect(finalFormat).toBe('## 다음 안건\n- (다음 회의에서 다룰 것)')
  })

  it('모든 블록 종류가 컴파일된다', () => {
    const { finalFormat, headings } = compileTemplate({
      blocks: SUMMARY_BLOCK_KINDS.map((kind) =>
        kind === 'custom' ? custom('메모') : createSummaryBlock(kind)
      )
    })

    expect(headings).toHaveLength(SUMMARY_BLOCK_KINDS.length)
    expect(finalFormat).not.toContain('- ()')
  })
})

describe('buildTemplatePreview', () => {
  it('지시문이 아니라 결과 뼈대를 보여 준다', () => {
    const preview = buildTemplatePreview({ blocks: DEFAULT_SUMMARY_TEMPLATE.blocks })

    expect(preview).toBe('## 핵심 요약\n- …\n\n## 결정 사항\n- …\n\n## 다음 할 일\n- …')
  })
})

describe('findMissingHeadings', () => {
  it('결과에 없는 제목만 돌려준다', () => {
    const summary = '## 핵심 요약\n- 배포 연기\n\n## 다음 할 일\n- 없음'

    expect(
      findMissingHeadings({ summary, headings: ['핵심 요약', '결정 사항', '다음 할 일'] })
    ).toEqual(['결정 사항'])
  })
})

describe('summaryTemplateProblem', () => {
  const blocks = DEFAULT_SUMMARY_TEMPLATE.blocks

  it('문제가 없으면 null', () => {
    expect(summaryTemplateProblem({ name: '주간 회의', blocks })).toBeNull()
  })

  it('이름·블록 수 제약을 확인한다', () => {
    expect(summaryTemplateProblem({ name: '  ', blocks })).toContain('이름')
    expect(summaryTemplateProblem({ name: '가'.repeat(31), blocks })).toContain('30자')
    expect(summaryTemplateProblem({ name: '주간', blocks: [] })).toContain('하나 이상')

    const tooMany = Array.from({ length: SUMMARY_TEMPLATE_MAX_BLOCKS + 1 }, () => custom('메모'))
    expect(summaryTemplateProblem({ name: '주간', blocks: tooMany })).toContain('10개')
  })

  it('custom이 아닌 종류는 한 번만 넣는다', () => {
    const problem = summaryTemplateProblem({
      name: '주간',
      blocks: [createSummaryBlock('decisions'), createSummaryBlock('decisions')]
    })

    expect(problem).toContain('결정 사항')
    expect(
      summaryTemplateProblem({ name: '주간', blocks: [custom('하나'), custom('둘')] })
    ).toBeNull()
  })

  it('제목에 #·줄바꿈을 막는다', () => {
    expect(
      summaryTemplateProblem({ name: '주간', blocks: [{ kind: 'overview', heading: '#요약' }] })
    ).toContain('#')
    expect(
      summaryTemplateProblem({ name: '주간', blocks: [{ kind: 'overview', heading: '가\n나' }] })
    ).toContain('줄바꿈')
  })

  it('custom 설명이 비면 막는다', () => {
    expect(summaryTemplateProblem({ name: '주간', blocks: [custom(' ')] })).toContain('직접 적기')
  })

  it('영어 사전을 넘기면 영어로 안내한다', () => {
    expect(
      summaryTemplateProblem({
        name: '',
        blocks,
        errors: summaryTemplateEn.errors,
        blockNames: summaryTemplateEn.blocks
      })
    ).toBe(summaryTemplateEn.errors.emptyName)
  })
})

describe('readSummaryTemplateDraft', () => {
  it('공백을 정리해 돌려준다', () => {
    expect(
      readSummaryTemplateDraft({
        id: 'abc',
        name: ' 주간 ',
        blocks: [{ kind: 'overview', heading: ' 요약 ' }]
      })
    ).toEqual({ id: 'abc', name: '주간', blocks: [{ kind: 'overview', heading: '요약' }] })
  })

  it('모양이 깨졌거나 모르는 kind면 거절한다', () => {
    expect(() => readSummaryTemplateDraft(null)).toThrow()
    expect(() =>
      readSummaryTemplateDraft({ name: '주간', blocks: [{ kind: 'poem', heading: '시' }] })
    ).toThrow()
    expect(() => readSummaryTemplateDraft({ id: 3, name: '주간', blocks: [] })).toThrow()
  })

  it('제약을 어기면 안내 문구로 거절한다', () => {
    expect(() => readSummaryTemplateDraft({ name: '주간', blocks: [] })).toThrow('하나 이상')
  })
})

describe('readStoredBlocks', () => {
  it('모르는 kind와 깨진 블록은 버린다', () => {
    expect(
      readStoredBlocks([
        { kind: 'overview', heading: '요약' },
        { kind: 'future', heading: '새 블록' },
        { kind: 'custom', heading: '메모' },
        'broken'
      ])
    ).toEqual([{ kind: 'overview', heading: '요약' }])
  })

  it('배열이 아니면 빈 배열', () => {
    expect(readStoredBlocks({})).toEqual([])
  })
})
