import { describe, expect, it } from 'vitest'

import { speechTextOf } from './speechText'

describe('speechTextOf', () => {
  it('제목·강조·목록·인용 기호를 지우고 링크는 글자만 남긴다', () => {
    const markdown = '## 오늘 할 일\n\n- **보고서** 제출\n1. [회의록](notes/a.md) 보기\n> 참고'

    expect(speechTextOf(markdown)).toBe('오늘 할 일\n보고서 제출\n회의록 보기\n참고')
  })

  it('코드 블록은 빼고 인라인 코드는 글자로 읽는다', () => {
    const markdown = '`tasks.md`를 고쳤어요.\n\n```ts\nconst a = 1\n```\n\n끝'

    expect(speechTextOf(markdown)).toBe('tasks.md를 고쳤어요.\n끝')
  })

  it('표는 구분선을 빼고 칸을 띄어 읽는다', () => {
    const markdown = '| 이름 | 마감 |\n| --- | :-: |\n| 보고서 | 금요일 |'

    expect(speechTextOf(markdown)).toBe('이름 마감\n보고서 금요일')
  })

  it('범위를 뜻하는 물결과 할 일 상자를 다룬다', () => {
    expect(speechTextOf('- [x] 3~5일 걸림\n- [ ] ~~취소~~')).toBe('3~5일 걸림\n취소')
  })

  it('닫히지 않은 코드 블록은 끝까지 뺀다', () => {
    expect(speechTextOf('설명\n```\nrm -rf')).toBe('설명')
  })
})
