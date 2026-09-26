import { createReadStream, createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { BITS_PER_SAMPLE, CHANNELS, SAMPLE_RATE_HZ } from '@shared/audio'
import { buildWavHeader, WAV_HEADER_BYTES } from './wavWriter'

/**
 * 가져올 수 있는 확장자. `afconvert`로 실측한 형식만 둔다 — webm·ogg(Opus/Vorbis)는 못 읽는다
 * (references/architecture.md "녹음 파일 가져오기").
 */
export const IMPORT_EXTENSIONS = [
  'm4a',
  'mp3',
  'wav',
  'aac',
  'aif',
  'aiff',
  'caf',
  'flac',
  'mp4',
  'mov'
]

/**
 * 변환 결과의 헤더를 살피려고 파일 앞에서 읽어 두는 크기. `--no-filler`라 FLLR 패딩은 없고
 * fmt(최대 40바이트)·LIST 정도만 `data` 앞에 온다
 */
export const IMPORT_HEADER_PROBE_BYTES = 4096

const RIFF_HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const PCM_FORMAT_TAG = 1
/** `afconvert`가 모노 원본에 쓰는 WAVE_FORMAT_EXTENSIBLE. 서브포맷 GUID의 앞 2바이트가 실제 태그다 */
const EXTENSIBLE_FORMAT_TAG = 0xfffe
const EXTENSIBLE_SUBFORMAT_OFFSET = 24
const EXTENSIBLE_FMT_BYTES = 40

/** 회의 제목 상한. `meetings:rename` 핸들러와 같은 값이다 */
const TITLE_MAX_LENGTH = 200

interface WavChunk {
  id: string
  dataOffset: number
  size: number
}

export interface ImportedWavLayout {
  /** PCM 본문이 시작하는 파일 오프셋. 녹음 WAV는 44 */
  dataOffset: number
  dataBytes: number
}

const listChunks = (head: Buffer) => {
  const chunks: WavChunk[] = []
  let offset = RIFF_HEADER_BYTES

  while (offset + CHUNK_HEADER_BYTES <= head.length) {
    const size = head.readUInt32LE(offset + 4)
    chunks.push({ id: head.toString('ascii', offset, offset + 4), dataOffset: offset + 8, size })
    offset += CHUNK_HEADER_BYTES + size + (size % 2)
  }

  return chunks
}

/** fmt 청크가 녹음과 같은 16kHz mono 16bit PCM인지. EXTENSIBLE은 서브포맷이 PCM이면 받는다 */
const isRecordingFormat = ({ head, fmt }: { head: Buffer; fmt: WavChunk }) => {
  if (fmt.dataOffset + 16 > head.length) return false

  const formatTag = head.readUInt16LE(fmt.dataOffset)
  const channels = head.readUInt16LE(fmt.dataOffset + 2)
  const sampleRate = head.readUInt32LE(fmt.dataOffset + 4)
  const bitsPerSample = head.readUInt16LE(fmt.dataOffset + 14)
  if (channels !== CHANNELS || sampleRate !== SAMPLE_RATE_HZ || bitsPerSample !== BITS_PER_SAMPLE) {
    return false
  }
  if (formatTag === PCM_FORMAT_TAG) return true
  if (formatTag !== EXTENSIBLE_FORMAT_TAG || fmt.size < EXTENSIBLE_FMT_BYTES) return false
  if (fmt.dataOffset + EXTENSIBLE_FMT_BYTES > head.length) return false

  return head.readUInt16LE(fmt.dataOffset + EXTENSIBLE_SUBFORMAT_OFFSET) === PCM_FORMAT_TAG
}

/**
 * 변환한 WAV 앞부분을 청크 단위로 걸어 `data` 본문 위치와 크기를 찾는다. 형식이 녹음과 다르거나
 * 헤더 모양을 알 수 없으면 null. `afconvert`는 모노 원본에서 EXTENSIBLE 헤더(68바이트)를 쓰므로
 * 36바이트 고정 위치로 읽으면 안 된다 (references/pitfalls.md).
 */
export const parseImportedWav = (head: Buffer): ImportedWavLayout | null => {
  if (head.length < RIFF_HEADER_BYTES) return null
  if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') {
    return null
  }

  const chunks = listChunks(head)
  const fmt = chunks.find((chunk) => chunk.id === 'fmt ')
  const data = chunks.find((chunk) => chunk.id === 'data')
  if (!fmt || !data || !isRecordingFormat({ head, fmt })) return null

  return { dataOffset: data.dataOffset, dataBytes: data.size }
}

/**
 * PCM 본문을 새 44바이트 헤더 뒤로 복사해 같은 경로로 바꾼다. 이후 단계(정규화·sherpa·재생)는
 * 녹음과 똑같은 헤더만 보게 된다. 임시 파일에 쓰고 `rename`하므로 실패해도 원래 파일은 남는다
 */
export const rewriteWithCanonicalHeader = async ({
  wavPath,
  layout
}: {
  wavPath: string
  layout: ImportedWavLayout
}) => {
  const tempPath = `${wavPath}.rewrite`
  const { dataOffset, dataBytes } = layout

  try {
    const output = createWriteStream(tempPath)
    output.write(buildWavHeader({ dataBytes }))
    await pipeline(
      createReadStream(wavPath, { start: dataOffset, end: dataOffset + dataBytes - 1 }),
      output
    )
    await rename(tempPath, wavPath)
  } catch (caught) {
    await rm(tempPath, { force: true })
    throw caught
  }
}

export const isCanonicalLayout = (layout: ImportedWavLayout) =>
  layout.dataOffset === WAV_HEADER_BYTES

/** 파일 이름(확장자 제외)을 회의 제목으로 쓴다. 비면 null이고 호출하는 쪽이 기본 제목을 쓴다 */
export const titleFromFilePath = (filePath: string) => {
  const title = path.parse(filePath).name.trim().slice(0, TITLE_MAX_LENGTH).trim()

  return title || null
}
