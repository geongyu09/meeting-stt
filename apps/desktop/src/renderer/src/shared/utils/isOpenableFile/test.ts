import { describe, expect, it } from 'vitest'

import { isOpenableFile } from './index'

describe('isOpenableFile', () => {
  it('작업 폴더 안의 마크다운만 연다', () => {
    expect(isOpenableFile('notes/a.md')).toBe(true)
    expect(isOpenableFile('README.MD')).toBe(true)
    expect(isOpenableFile('/Users/me/other/a.md')).toBe(false)
    expect(isOpenableFile('scripts/run.ts')).toBe(false)
  })
})
