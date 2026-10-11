import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_DICTATION_TERMS,
  applyTermReadings,
  dictationInsertTextOf,
  dictationTermsOf,
  joinDictationPieces,
  refineDictationText,
  type DictationTerm
} from './dictation'

const GLOSSARY: DictationTerm[] = [
  { term: 'GitHub', readings: ['깃허브'] },
  { term: 'Next.js', readings: ['넥스트 제이에스'] },
  { term: 'PostgreSQL', readings: ['포스트그레스', '포스트그레스큐엘'] },
  { term: 'Bun', readings: ['번'] }
]

describe('dictationTermsOf', () => {
  it('표기 = 읽기1, 읽기2 줄을 치환 목록으로 바꾼다', () => {
    expect(dictationTermsOf(['GitHub = 깃허브', 'SQL = 에스큐엘, 시퀄'])).toEqual([
      { term: 'GitHub', readings: ['깃허브'] },
      { term: 'SQL', readings: ['에스큐엘', '시퀄'] }
    ])
  })

  it('읽기가 없는 줄과 빈 줄은 뺀다', () => {
    expect(dictationTermsOf(['Electron', '', ' = 깃허브'])).toEqual([])
  })

  it('내장 사전은 읽기가 둘인 용어를 둘 다 받는다', () => {
    const sql = BUILT_IN_DICTATION_TERMS.find(({ term }) => term === 'SQL')

    expect(sql?.readings).toEqual(['에스큐엘', '시퀄'])
  })
})

describe('refineDictationText — 비음성 표기', () => {
  it('대괄호·소괄호 표기와 음표를 지운다', () => {
    expect(refineDictationText({ text: '[음악] 안녕하세요 (웃음) ♪', terms: [] })).toBe(
      '안녕하세요'
    )
  })
})

describe('refineDictationText — 간투사', () => {
  it('어절 전체가 간투사인 것만 지운다', () => {
    expect(refineDictationText({ text: '음 그래서 어 내일 회의는 아 세 시예요', terms: [] })).toBe(
      '그래서 내일 회의는 세 시예요'
    )
  })

  it('쉼표·말줄임표가 붙은 간투사도 지운다', () => {
    expect(refineDictationText({ text: '음, 네 어… 맞아요', terms: [] })).toBe('네 맞아요')
  })

  it('관형사로 쓰인 그는 남기고 머뭇거림의 그는 지운다', () => {
    expect(refineDictationText({ text: '그 사람이 왔어요', terms: [] })).toBe('그 사람이 왔어요')
    expect(refineDictationText({ text: '그, 내일 보자', terms: [] })).toBe('내일 보자')
    expect(refineDictationText({ text: '내일 보자 그', terms: [] })).toBe('내일 보자')
  })

  it('간투사가 다른 어절의 일부면 건드리지 않는다', () => {
    expect(refineDictationText({ text: '어제 음식을 아주 많이', terms: [] })).toBe(
      '어제 음식을 아주 많이'
    )
  })

  it('간투사만 말하면 빈 문자열이다', () => {
    expect(refineDictationText({ text: '음 어 음…', terms: [] })).toBe('')
  })
})

describe('applyTermReadings', () => {
  it('어절 경계의 읽기를 표기로 바꾸고 뒤의 조사는 남긴다', () => {
    expect(applyTermReadings({ text: '깃허브에 올렸어요', terms: GLOSSARY })).toBe(
      'GitHub에 올렸어요'
    )
    expect(applyTermReadings({ text: '깃허브 봐 주세요', terms: GLOSSARY })).toBe(
      'GitHub 봐 주세요'
    )
    expect(applyTermReadings({ text: '깃허브에서는 되는데', terms: GLOSSARY })).toBe(
      'GitHub에서는 되는데'
    )
  })

  it('문장 끝 문장부호 앞에서도 바꾼다', () => {
    expect(applyTermReadings({ text: '깃허브.', terms: GLOSSARY })).toBe('GitHub.')
  })

  it('어절 안에 들어 있는 읽기는 바꾸지 않는다', () => {
    expect(applyTermReadings({ text: '깃허브님이', terms: GLOSSARY })).toBe('깃허브님이')
  })

  it('공백이 든 읽기는 어절 둘을 함께 잡는다', () => {
    expect(applyTermReadings({ text: '넥스트 제이에스로 만들었다', terms: GLOSSARY })).toBe(
      'Next.js로 만들었다'
    )
  })

  it('읽기가 여럿이면 긴 읽기부터 맞춘다', () => {
    expect(applyTermReadings({ text: '포스트그레스큐엘을 쓴다', terms: GLOSSARY })).toBe(
      'PostgreSQL을 쓴다'
    )
  })

  it('한 음절 읽기는 일상어와 겹쳐 바꾸지 않는다', () => {
    expect(applyTermReadings({ text: '한 번 더 번 쓰자', terms: GLOSSARY })).toBe(
      '한 번 더 번 쓰자'
    )
  })
})

describe('refineDictationText — 전체', () => {
  it('규칙을 순서대로 적용하고 공백을 정리한다', () => {
    expect(
      refineDictationText({ text: '  음  깃허브에 \n 올렸어요  (웃음) ', terms: GLOSSARY })
    ).toBe('GitHub에 올렸어요')
  })

  it('빈 입력은 빈 문자열이다', () => {
    expect(refineDictationText({ text: '', terms: GLOSSARY })).toBe('')
  })
})

describe('조각 연결', () => {
  it('첫 조각 앞에는 공백을 붙이지 않고 둘째부터 붙인다', () => {
    expect(dictationInsertTextOf({ piece: '안녕하세요', isFirst: true })).toBe('안녕하세요')
    expect(dictationInsertTextOf({ piece: '내일 봅시다', isFirst: false })).toBe(' 내일 봅시다')
  })

  it('세션 전체는 공백 하나로 잇는다', () => {
    expect(joinDictationPieces(['안녕하세요', '내일 봅시다'])).toBe('안녕하세요 내일 봅시다')
    expect(joinDictationPieces([])).toBe('')
  })
})
