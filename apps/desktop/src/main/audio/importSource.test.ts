import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildWavHeader, WAV_HEADER_BYTES } from './wavWriter'
import {
  isCanonicalLayout,
  parseImportedWav,
  rewriteWithCanonicalHeader,
  titleFromFilePath
} from './importSource'

const SAMPLE_RATE_HZ = 16000
const EXTENSIBLE_TAG = 0xfffe

/**
 * `afconvert`가 모노 AAC 원본에 쓰는 WAVE_FORMAT_EXTENSIBLE 헤더(68바이트).
 * 2026-09-26 실제 출력의 앞 68바이트를 그대로 옮겼다 (fmt 40바이트, 서브포맷 PCM)
 */
const buildExtensibleHeader = ({
  dataBytes,
  subformat = 1
}: {
  dataBytes: number
  subformat?: number
}) => {
  const header = Buffer.alloc(68)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(60 + dataBytes, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(40, 16)
  header.writeUInt16LE(EXTENSIBLE_TAG, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE_HZ, 24)
  header.writeUInt32LE(SAMPLE_RATE_HZ * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.writeUInt16LE(22, 36)
  header.writeUInt16LE(16, 38)
  header.writeUInt32LE(4, 40)
  header.writeUInt16LE(subformat, 44)
  header.write('data', 60, 'ascii')
  header.writeUInt32LE(dataBytes, 64)

  return header
}

describe('parseImportedWav', () => {
  it('44바이트 헤더에서 data 위치와 크기를 읽는다', () => {
    const layout = parseImportedWav(buildWavHeader({ dataBytes: 32000 }))

    expect(layout).toEqual({ dataOffset: WAV_HEADER_BYTES, dataBytes: 32000 })
    expect(isCanonicalLayout(layout!)).toBe(true)
  })

  it('afconvert의 EXTENSIBLE 헤더(모노 원본)는 68바이트 위치의 data를 찾는다', () => {
    const layout = parseImportedWav(buildExtensibleHeader({ dataBytes: 32000 }))

    expect(layout).toEqual({ dataOffset: 68, dataBytes: 32000 })
    expect(isCanonicalLayout(layout!)).toBe(false)
  })

  it('data 앞에 다른 청크가 있어도 건너뛴다', () => {
    const header = buildWavHeader({ dataBytes: 32000 })
    const list = Buffer.alloc(8 + 10)
    list.write('LIST', 0, 'ascii')
    list.writeUInt32LE(10, 4)

    const layout = parseImportedWav(
      Buffer.concat([header.subarray(0, 36), list, header.subarray(36)])
    )

    expect(layout).toEqual({ dataOffset: WAV_HEADER_BYTES + 18, dataBytes: 32000 })
  })

  it('EXTENSIBLE의 서브포맷이 PCM이 아니면 null', () => {
    expect(parseImportedWav(buildExtensibleHeader({ dataBytes: 32000, subformat: 3 }))).toBeNull()
  })

  it('16kHz mono 16bit가 아니면 null', () => {
    const header = Buffer.from(buildWavHeader({ dataBytes: 32000 }))
    header.writeUInt16LE(2, 22)

    expect(parseImportedWav(header)).toBeNull()
  })

  it('RIFF/WAVE가 아니거나 data 청크가 없으면 null', () => {
    const header = Buffer.from(buildWavHeader({ dataBytes: 32000 }))
    header.write('RIFX', 0, 'ascii')

    expect(parseImportedWav(header)).toBeNull()
    expect(parseImportedWav(buildWavHeader({ dataBytes: 32000 }).subarray(0, 36))).toBeNull()
    expect(parseImportedWav(Buffer.alloc(4))).toBeNull()
  })
})

describe('rewriteWithCanonicalHeader', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'import-source-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('EXTENSIBLE WAV를 같은 PCM의 44바이트 헤더 WAV로 바꾼다', async () => {
    const pcm = Buffer.from(Int16Array.from([1, -2, 3, 4000]).buffer)
    const wavPath = path.join(dir, 'a.wav')
    await writeFile(wavPath, Buffer.concat([buildExtensibleHeader({ dataBytes: pcm.length }), pcm]))

    const layout = parseImportedWav(await readFile(wavPath))!
    await rewriteWithCanonicalHeader({ wavPath, layout })

    const rewritten = await readFile(wavPath)
    expect(rewritten).toEqual(Buffer.concat([buildWavHeader({ dataBytes: pcm.length }), pcm]))
    expect(parseImportedWav(rewritten)).toEqual({
      dataOffset: WAV_HEADER_BYTES,
      dataBytes: pcm.length
    })
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
