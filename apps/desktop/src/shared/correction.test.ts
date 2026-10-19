import { describe, expect, it } from 'vitest'

import { changedWordsOf, CORRECTION_PROMOTE_COUNT, countCorrections } from './correction'

describe('changedWordsOf', () => {
  it('바뀐 어절의 수정문 쪽을 문장 부호와 공유 조사를 떼고 돌려준다', () => {
    expect(changedWordsOf({ before: '깃허브를 쓴다.', after: 'GitHub를 쓴다.' })).toEqual([
      'GitHub'
    ])
  })

  it('조사가 바뀐 경우는 조사를 떼지 않는다', () => {
    expect(changedWordsOf({ before: '루덴스가 말했다', after: '루덴스는 말했다' })).toEqual([
      '루덴스는'
    ])
  })

  it('원문 어절 둘이 한 어절로 합쳐져도 센다', () => {
    expect(changedWordsOf({ before: '깃 허브 쓴다', after: 'GitHub 쓴다' })).toEqual(['GitHub'])
  })

  it('순수 삽입·삭제·한 글자·숫자·같은 문장은 세지 않는다', () => {
    expect(changedWordsOf({ before: '쓴다', after: '우리가 쓴다' })).toEqual([])
    expect(changedWordsOf({ before: '우리가 쓴다', after: '쓴다' })).toEqual([])
    expect(changedWordsOf({ before: '한 개', after: '두 개' })).toEqual([])
    expect(changedWordsOf({ before: '12개', after: '13개' })).toEqual(['13개'])
    expect(changedWordsOf({ before: '3', after: '4' })).toEqual([])
    expect(changedWordsOf({ before: '같다', after: '같다' })).toEqual([])
  })

  it('빈 발화도 처리한다', () => {
    expect(changedWordsOf({ before: '', after: '' })).toEqual([])
    expect(changedWordsOf({ before: '', after: 'GitHub' })).toEqual([])
  })
})

describe('countCorrections', () => {
  it('횟수를 누적하고 승격 횟수에 닿은 단어를 돌려주며 횟수에서 뺀다', () => {
    const first = countCorrections({ counts: {}, before: '깃허브', after: 'GitHub' })
    expect(first).toEqual({ counts: { GitHub: 1 }, promoted: [] })

    const third = countCorrections({
      counts: { GitHub: CORRECTION_PROMOTE_COUNT - 1, pnpm: 1 },
      before: '기타브를 쓴다',
      after: 'GitHub를 쓴다'
    })
    expect(third).toEqual({ counts: { pnpm: 1 }, promoted: ['GitHub'] })
  })

  it('한 번의 편집에서 같은 단어는 한 번만 센다', () => {
    const { counts } = countCorrections({
      counts: {},
      before: '깃허브 그리고 기타브',
      after: 'GitHub 그리고 GitHub'
    })
    expect(counts).toEqual({ GitHub: 1 })
  })
})
