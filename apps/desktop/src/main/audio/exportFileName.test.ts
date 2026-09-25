import { describe, expect, it } from 'vitest'
import { toExportFileName } from './exportFileName'

describe('toExportFileName', () => {
  it('제목 뒤에 .wav를 붙인다', () => {
    expect(toExportFileName('9월 스프린트 회고')).toBe('9월 스프린트 회고.wav')
  })

  it('파일명에 못 쓰는 문자를 _로 바꾼다', () => {
    expect(toExportFileName('기획/개발: 주간 회의?')).toBe('기획_개발_ 주간 회의_.wav')
  })

  it('점으로 시작하는 제목은 숨김 파일이 되지 않게 점을 뗀다', () => {
    expect(toExportFileName('..회의')).toBe('회의.wav')
  })

  it('비어 있으면 기본 이름을 쓴다', () => {
    expect(toExportFileName('   ')).toBe('회의 녹음.wav')
    expect(toExportFileName('...')).toBe('회의 녹음.wav')
  })

  it('너무 긴 제목은 자른다', () => {
    expect(toExportFileName('가'.repeat(300))).toBe(`${'가'.repeat(120)}.wav`)
  })
})
