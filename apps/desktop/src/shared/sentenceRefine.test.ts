import { describe, expect, it } from 'vitest'

import {
  buildSentencePrompt,
  guardSentence,
  parseSentenceOutput,
  SENTENCE_CHUNK_CHARS,
  splitSentenceChunks
} from './sentenceRefine'

const ID = 'u1'

describe('splitSentenceChunks', () => {
  it('글자 수 한도를 넘지 않게 순서대로 나눈다', () => {
    const half = 'ㄱ'.repeat(SENTENCE_CHUNK_CHARS / 2)
    const sources = ['a', 'b', 'c'].map((id) => ({ id, text: half }))

    expect(splitSentenceChunks({ sources }).map((chunk) => chunk.map(({ id }) => id))).toEqual([
      ['a', 'b'],
      ['c']
    ])
  })

  it('한도보다 긴 발화 하나는 그것만으로 조각이 된다', () => {
    const sources = [{ id: 'a', text: 'ㄱ'.repeat(SENTENCE_CHUNK_CHARS + 1) }]

    expect(splitSentenceChunks({ sources })).toHaveLength(1)
  })
})

describe('buildSentencePrompt', () => {
  const chunk = [
    { id: 'x', text: '첫 줄' },
    { id: 'y', text: '둘째 줄' }
  ]

  it('발화 id 대신 1부터 번호를 붙인다', () => {
    const prompt = buildSentencePrompt({ chunk, glossary: [] })

    expect(prompt).toContain('[1] 첫 줄\n[2] 둘째 줄')
    expect(prompt).not.toContain('x')
    expect(prompt).not.toContain('용어 사전')
  })

  it('용어 사전이 있으면 표기와 읽기를 함께 넣는다', () => {
    const prompt = buildSentencePrompt({ chunk, glossary: ['tarball = 타볼, 타르볼', '배포'] })

    expect(prompt).toContain('- tarball = 타볼, 타르볼\n- 배포')
  })
})

describe('parseSentenceOutput', () => {
  const chunk = [
    { id: 'x', text: '차 통지를 해야' },
    { id: 'y', text: '그대로' }
  ]

  it('번호를 조각의 발화 id로 바꾼다', () => {
    expect(parseSentenceOutput({ output: '[1] 차 정지를 해야', chunk })).toEqual([
      { id: 'x', proposed: '차 정지를 해야' }
    ])
  })

  it('없음·조각 밖 번호·원문과 같은 줄·형식이 깨진 줄은 버린다', () => {
    const output = ['없음', '[3] 없는 줄', '[2] 그대로', '설명: 고쳤습니다'].join('\n')

    expect(parseSentenceOutput({ output, chunk })).toEqual([])
  })
})

describe('guardSentence', () => {
  it('발음이 비슷한 수정은 반영하고 쌍을 남긴다', () => {
    const result = guardSentence({
      utteranceId: ID,
      before: '빨간불에서는 차 통지를 해야 되나 거인이 보호구역에서는',
      proposed: '빨간불에서는 차 정지를 해야 되나 어린이 보호구역에서는',
      glossary: []
    })

    expect(result.text).toBe('빨간불에서는 차 정지를 해야 되나 어린이 보호구역에서는')
    expect(result.pairs.map(({ from, to }) => `${from}→${to}`)).toEqual([
      '통지를→정지를',
      '거인이→어린이'
    ])
    expect(result.pairs.every(({ utteranceId }) => utteranceId === ID)).toBe(true)
  })

  it('소리가 먼 수정과 넣기만·빼기만 한 어절은 원문을 남긴다', () => {
    const result = guardSentence({
      utteranceId: ID,
      before: '이 등분분서에서 되게 중요한',
      proposed: '이 모노레포에서 정말 되게 중요한',
      glossary: []
    })

    expect(result).toEqual({ text: '이 등분분서에서 되게 중요한', pairs: [] })
  })

  it('일부 덩어리만 통과하면 그 자리만 바꾼다', () => {
    const result = guardSentence({
      utteranceId: ID,
      before: '대포 파일을 등분분서로',
      proposed: '배포 파일을 모노레포로',
      glossary: []
    })

    expect(result.text).toBe('배포 파일을 등분분서로')
  })

  it('수정문의 영문은 용어 사전 읽기로 비교한다', () => {
    const result = guardSentence({
      utteranceId: ID,
      before: '카볼을 까서 탑을 디프로 분석',
      proposed: 'tarball을 까서 tarball diff로 분석',
      glossary: ['tarball = 타볼, 타르볼', 'diff = 디프']
    })

    expect(result.text).toBe('tarball을 까서 tarball diff로 분석')
  })

  it('여러 단어로 된 용어는 통째로 읽는다', () => {
    const result = guardSentence({
      utteranceId: ID,
      before: '피어 스패던시의 이동 때문에',
      proposed: 'peer dependency의 이동 때문에',
      glossary: ['peer dependency = 피어 디펜던시']
    })

    expect(result.pairs).toHaveLength(1)
  })

  it('사전에 없는 대문자 약어는 알파벳 이름으로 읽는다', () => {
    const result = guardSentence({
      utteranceId: ID,
      before: '이 투이를 돌리면',
      proposed: 'E2E를 돌리면',
      glossary: []
    })

    expect(result.text).toBe('E2E를 돌리면')
  })

  it('영문끼리는 글자로 비교한다', () => {
    const result = guardSentence({
      utteranceId: ID,
      before: 'CIE에서 돌려요',
      proposed: 'CI에서 돌려요',
      glossary: []
    })

    expect(result.text).toBe('CI에서 돌려요')
  })

  it('읽기를 모르는 영어 단어로 바꾼 수정은 소리로 확인할 수 없어 버린다', () => {
    const result = guardSentence({
      utteranceId: ID,
      before: '퍼스트 대거티브가 생겨서는',
      proposed: 'false negative가 생겨서는',
      glossary: []
    })

    expect(result.pairs).toEqual([])
  })
})
