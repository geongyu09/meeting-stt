import { describe, expect, it } from 'vitest'
import { folderPathsOf, matchesQuery, menuQueryOf, replaceMenuToken } from './menuQuery'

describe('menuQueryOf', () => {
  it('글 맨 앞의 /는 명령 메뉴를 연다', () => {
    expect(menuQueryOf('/')).toEqual({ kind: 'command', query: '', start: 0 })
    expect(menuQueryOf('/wi')).toEqual({ kind: 'command', query: 'wi', start: 0 })
  })

  it('맨 앞이 아닌 /와 토큰 뒤의 공백은 명령 메뉴를 열지 않는다', () => {
    expect(menuQueryOf('정리 /wiki')).toBeNull()
    expect(menuQueryOf('/wiki-review ')).toBeNull()
    expect(menuQueryOf('/wiki-review 오늘')).toBeNull()
  })

  it('@는 어디에 있든 끝 토큰이면 파일 메뉴를 연다', () => {
    expect(menuQueryOf('정리해줘 @meet')).toEqual({ kind: 'file', query: 'meet', start: 5 })
    expect(menuQueryOf('첫 줄\n@')).toEqual({ kind: 'file', query: '', start: 4 })
  })

  it('빈 글이나 보통 글에는 메뉴가 없다', () => {
    expect(menuQueryOf('')).toBeNull()
    expect(menuQueryOf('요약해 줘')).toBeNull()
  })
})

describe('replaceMenuToken', () => {
  it('끝 토큰을 고른 값으로 바꾸고 공백을 붙인다', () => {
    expect(replaceMenuToken({ text: '정리해줘 @meet', start: 5, replacement: '@a/b.md' })).toBe(
      '정리해줘 @a/b.md '
    )
    expect(replaceMenuToken({ text: '/wi', start: 0, replacement: '/wiki-review' })).toBe(
      '/wiki-review '
    )
  })
})

describe('matchesQuery', () => {
  it('빈 검색어는 전부 남기고, 대소문자를 가리지 않고 어느 칸이든 본다', () => {
    expect(matchesQuery({ query: '', fields: ['a'] })).toBe(true)
    expect(matchesQuery({ query: 'REVIEW', fields: ['wiki-review', '복습'] })).toBe(true)
    expect(matchesQuery({ query: '복습', fields: ['wiki-review', '복습'] })).toBe(true)
    expect(matchesQuery({ query: 'x', fields: ['wiki-review', '복습'] })).toBe(false)
  })
})

describe('folderPathsOf', () => {
  it('중첩 폴더를 모두 뽑고 루트 파일은 폴더를 만들지 않는다', () => {
    expect(folderPathsOf(['a/b/c.md', 'a/d.md', 'e.md'])).toEqual(['a/', 'a/b/'])
    expect(folderPathsOf([])).toEqual([])
  })
})
