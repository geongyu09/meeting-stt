import { describe, expect, it } from 'vitest'
import { buildWavHeader, WAV_HEADER_BYTES } from './wavWriter'
import { readDataBytes, titleFromFilePath } from './importSource'

describe('readDataBytes', () => {
  it('44바이트 헤더에서 data 크기를 읽는다', () => {
    expect(readDataBytes(buildWavHeader({ dataBytes: 32000 }))).toBe(32000)
  })

  it('data 청크가 36바이트에 없으면 null', () => {
    const header = Buffer.from(buildWavHeader({ dataBytes: 32000 }))
    header.write('FLLR', 36, 'ascii')

    expect(readDataBytes(header)).toBeNull()
  })

  it('RIFF가 아니거나 헤더보다 짧으면 null', () => {
    const header = Buffer.from(buildWavHeader({ dataBytes: 32000 }))
    header.write('RIFX', 0, 'ascii')

    expect(readDataBytes(header)).toBeNull()
    expect(readDataBytes(Buffer.alloc(WAV_HEADER_BYTES - 1))).toBeNull()
  })
})

describe('titleFromFilePath', () => {
  it('확장자를 뺀 파일 이름을 쓴다', () => {
    expect(titleFromFilePath('/Users/me/Downloads/9월 주간 회의.m4a')).toBe('9월 주간 회의')
  })

  it('점이 여러 개면 마지막 확장자만 뺀다', () => {
    expect(titleFromFilePath('/tmp/2026.09.25 회의.mp3')).toBe('2026.09.25 회의')
  })

  it('앞뒤 공백을 지우고 200자로 자른다', () => {
    expect(titleFromFilePath(`/tmp/  ${'가'.repeat(250)}  .wav`)).toBe('가'.repeat(200))
  })

  it('이름이 비면 null', () => {
    expect(titleFromFilePath('/tmp/   .m4a')).toBeNull()
  })
})
