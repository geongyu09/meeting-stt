import { describe, expect, it } from 'vitest'

import type { LoadedDocument } from '../types/document'
import { mergeExternalChange } from './mergeExternalChange'

const clean: LoadedDocument = {
  path: 'a.md',
  saved: '처음',
  draft: '처음',
  hasExternalChange: false
}
const dirty: LoadedDocument = { ...clean, draft: '처음 + 내 편집' }

describe('mergeExternalChange', () => {
  it('앱이 직접 저장한 직후처럼 내용이 같으면 그대로 둔다', () => {
    expect(mergeExternalChange({ current: dirty, path: 'a.md', content: '처음' })).toBe(dirty)
  })

  it('편집 중이 아니면 새 내용으로 바꾼다', () => {
    expect(mergeExternalChange({ current: clean, path: 'a.md', content: '에이전트 편집' })).toEqual(
      {
        ...clean,
        saved: '에이전트 편집',
        draft: '에이전트 편집'
      }
    )
  })

  it('편집 중이면 내 편집을 지키고 외부 변경만 표시한다', () => {
    expect(mergeExternalChange({ current: dirty, path: 'a.md', content: '에이전트 편집' })).toEqual(
      {
        ...dirty,
        hasExternalChange: true
      }
    )
  })

  it('파일이 지워졌으면(읽기 실패) 편집 중이 아니어도 내용을 지우지 않고 표시만 한다', () => {
    expect(mergeExternalChange({ current: clean, path: 'a.md', content: null })).toEqual({
      ...clean,
      hasExternalChange: true
    })
  })

  it('다른 문서의 변경이나 열린 문서가 없으면 그대로 둔다', () => {
    expect(mergeExternalChange({ current: clean, path: 'b.md', content: 'x' })).toBe(clean)
    expect(mergeExternalChange({ current: null, path: 'a.md', content: 'x' })).toBeNull()
  })
})
