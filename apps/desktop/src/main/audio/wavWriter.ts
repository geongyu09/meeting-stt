import { open, type FileHandle } from 'node:fs/promises'
import { BITS_PER_SAMPLE, CHANNELS, SAMPLE_RATE_HZ } from '@shared/audio'

export const WAV_HEADER_BYTES = 44
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8
const PCM_FORMAT_TAG = 1
const INT16_MAX = 32767
const INT16_MIN = -32768

/** RIFF/WAVE 헤더(44바이트). dataBytes는 PCM 본문 길이 */
export const buildWavHeader = ({ dataBytes }: { dataBytes: number }) => {
  const header = Buffer.alloc(WAV_HEADER_BYTES)
  const byteRate = SAMPLE_RATE_HZ * CHANNELS * BYTES_PER_SAMPLE

  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(WAV_HEADER_BYTES - 8 + dataBytes, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(PCM_FORMAT_TAG, 20)
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(SAMPLE_RATE_HZ, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(CHANNELS * BYTES_PER_SAMPLE, 32)
  header.writeUInt16LE(BITS_PER_SAMPLE, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataBytes, 40)

  return header
}

/** renderer가 보낸 Float32(-1~1) PCM을 16bit LE PCM으로 바꾼다 */
export const float32ToInt16 = (samples: Float32Array) => {
  const pcm = Buffer.alloc(samples.length * BYTES_PER_SAMPLE)

  samples.forEach((sample, index) => {
    const scaled = Math.round(sample * INT16_MAX)
    pcm.writeInt16LE(Math.max(INT16_MIN, Math.min(INT16_MAX, scaled)), index * BYTES_PER_SAMPLE)
  })

  return pcm
}

export const durationSecOf = ({ dataBytes }: { dataBytes: number }) =>
  dataBytes / (SAMPLE_RATE_HZ * CHANNELS * BYTES_PER_SAMPLE)

/**
 * 녹음 중인 WAV 한 개를 담당한다. 길이를 모르는 상태로 시작하므로 자리만 잡은 헤더를 먼저 쓰고,
 * 정지 시 실제 길이로 덮어쓴다. 청크 쓰기는 직렬화해 순서가 섞이지 않게 한다
 * (references/pitfalls.md).
 */
export const createWavWriter = async ({ filePath }: { filePath: string }) => {
  const handle: FileHandle = await open(filePath, 'w')
  let dataBytes = 0
  let queue = handle.write(buildWavHeader({ dataBytes: 0 }), 0, WAV_HEADER_BYTES, 0)

  const appendChunk = (samples: Float32Array) => {
    const pcm = float32ToInt16(samples)
    const position = WAV_HEADER_BYTES + dataBytes
    dataBytes += pcm.length
    queue = queue.then(() => handle.write(pcm, 0, pcm.length, position))

    return queue.then(() => undefined)
  }

  const finalize = async () => {
    await queue
    await handle.write(buildWavHeader({ dataBytes }), 0, WAV_HEADER_BYTES, 0)
    await handle.close()

    return { dataBytes, durationSec: durationSecOf({ dataBytes }) }
  }

  return { appendChunk, finalize }
}

export type WavWriter = Awaited<ReturnType<typeof createWavWriter>>
