import { describe, expect, it } from 'vitest'

import { clipNote, extractNoteLinks } from './note'

describe('extractNoteLinks', () => {
  it('맨 URL과 마크다운 링크를 등장 순서대로 뽑고 문장 끝 구두점을 뗀다', () => {
    const note =
      '안건은 [문서](https://notion.so/team/a?b=1) 참고.\n시안: https://figma.com/file/x.'

    expect(extractNoteLinks(note)).toEqual([
      'https://notion.so/team/a?b=1',
      'https://figma.com/file/x'
    ])
  })

  it('같은 링크는 한 번만 넣는다', () => {
    expect(extractNoteLinks('https://a.com/x 그리고 https://a.com/x')).toEqual(['https://a.com/x'])
  })

  it('https가 아니거나 호스트가 없는 링크는 넣지 않는다', () => {
    expect(extractNoteLinks('http://a.com file:///etc/hosts https://. 링크 없음')).toEqual([])
  })

  it('한글 바로 뒤에 붙은 링크도 읽는다', () => {
    expect(extractNoteLinks('링크:https://a.com/가나')).toEqual(['https://a.com/가나'])
  })
})

describe('clipNote', () => {
  it('앞뒤 공백을 걷는다', () => {
    expect(clipNote({ note: '  안건\n\n', maxChars: 100 })).toBe('안건')
  })

  it('길면 자르고 생략 표시를 붙인다', () => {
    const clipped = clipNote({ note: '가'.repeat(10), maxChars: 4 })

    expect(clipped.startsWith('가가가가\n')).toBe(true)
    expect(clipped).toContain('생략')
  })

  it('빈 노트는 빈 문자열이다', () => {
    expect(clipNote({ note: ' \n ', maxChars: 10 })).toBe('')
  })
})
