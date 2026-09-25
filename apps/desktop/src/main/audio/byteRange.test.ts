import { describe, expect, it } from 'vitest'
import { parseByteRange } from './byteRange'

const SIZE = 1000

describe('parseByteRange', () => {
  it('헤더가 없으면 파일 전체로 응답한다', () => {
    expect(parseByteRange({ header: null, size: SIZE })).toBeNull()
  })

  it('시작만 있으면 끝까지 준다', () => {
    expect(parseByteRange({ header: 'bytes=100-', size: SIZE })).toEqual({ start: 100, end: 999 })
  })

  it('끝이 파일보다 크면 파일 끝으로 자른다', () => {
    expect(parseByteRange({ header: 'bytes=0-5000', size: SIZE })).toEqual({ start: 0, end: 999 })
  })

  it('끝에서 N바이트 요청을 해석한다', () => {
    expect(parseByteRange({ header: 'bytes=-200', size: SIZE })).toEqual({ start: 800, end: 999 })
    expect(parseByteRange({ header: 'bytes=-5000', size: SIZE })).toEqual({ start: 0, end: 999 })
  })

  it('파일 밖을 가리키면 416 대상이다', () => {
    expect(parseByteRange({ header: 'bytes=1000-', size: SIZE })).toBe('unsatisfiable')
    expect(parseByteRange({ header: 'bytes=500-100', size: SIZE })).toBe('unsatisfiable')
    expect(parseByteRange({ header: 'bytes=-0', size: SIZE })).toBe('unsatisfiable')
  })

  it('여러 구간·알 수 없는 단위는 무시하고 전체로 응답한다', () => {
    expect(parseByteRange({ header: 'bytes=0-10,20-30', size: SIZE })).toBeNull()
    expect(parseByteRange({ header: 'items=0-10', size: SIZE })).toBeNull()
    expect(parseByteRange({ header: 'bytes=-', size: SIZE })).toBeNull()
  })
})
