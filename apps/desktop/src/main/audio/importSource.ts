import path from 'node:path'
import { WAV_HEADER_BYTES } from './wavWriter'

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

/** `--no-filler`로 만든 WAV는 녹음과 같은 44바이트 헤더다 (`buildWavHeader`) */
const DATA_CHUNK_ID_OFFSET = 36
const DATA_CHUNK_SIZE_OFFSET = 40

/** 회의 제목 상한. `meetings:rename` 핸들러와 같은 값이다 */
const TITLE_MAX_LENGTH = 200

/**
 * 변환한 WAV 헤더에서 `data` 청크 크기를 읽는다. 헤더가 예상과 다르면 null —
 * 이후 단계(정규화·재생)가 44바이트 헤더를 전제로 하므로 다른 모양은 받지 않는다.
 */
export const readDataBytes = (header: Buffer) => {
  if (header.length < WAV_HEADER_BYTES) return null
  if (header.toString('ascii', 0, 4) !== 'RIFF') return null
  if (header.toString('ascii', DATA_CHUNK_ID_OFFSET, DATA_CHUNK_ID_OFFSET + 4) !== 'data') {
    return null
  }

  return header.readUInt32LE(DATA_CHUNK_SIZE_OFFSET)
}

/** 파일 이름(확장자 제외)을 회의 제목으로 쓴다. 비면 null이고 호출하는 쪽이 기본 제목을 쓴다 */
export const titleFromFilePath = (filePath: string) => {
  const title = path.parse(filePath).name.trim().slice(0, TITLE_MAX_LENGTH).trim()

  return title || null
}
