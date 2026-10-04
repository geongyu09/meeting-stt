import { frameSamplesOf } from '@meeting-stt/core/normalize'
import { rmsOf, SAMPLE_RATE_HZ } from '@shared/audio'
import { assessAudioQuality, measureAudioQuality } from '@shared/audioQuality'

const FRAME_SAMPLES = frameSamplesOf({ sampleRate: SAMPLE_RATE_HZ })
const FRAMES_PER_SEC = SAMPLE_RATE_HZ / FRAME_SAMPLES

/** 회의 중 이만큼 조용한 일은 드물고, 음소거는 처음부터 끝까지 무음이라 빨리 잡아야 한다 */
const SILENT_WINDOW_SEC = 20
/** 말이 구간의 10%(18초)만 있어도 발화 음량이 유지돼 짧은 침묵에 흔들리지 않는다 */
const FAINT_WINDOW_SEC = 180
/** 이보다 짧은 구간으로는 분위수가 흔들려 `faint`를 판정하지 않는다 */
const FAINT_MIN_SEC = 60

const SILENT_WINDOW_FRAMES = SILENT_WINDOW_SEC * FRAMES_PER_SEC
const FAINT_WINDOW_FRAMES = FAINT_WINDOW_SEC * FRAMES_PER_SEC
const FAINT_MIN_FRAMES = FAINT_MIN_SEC * FRAMES_PER_SEC

const issueOf = (frames: number[]) => {
  if (frames.length < SILENT_WINDOW_FRAMES) return null

  const recent = measureAudioQuality({ frameRms: frames.slice(-SILENT_WINDOW_FRAMES) })
  if (assessAudioQuality(recent) === 'silent') return 'silent'
  if (frames.length < FAINT_MIN_FRAMES) return null

  // 긴 구간이 통째로 조용했다가 방금 소리가 돌아온 경우는 `faint`가 아니다
  return assessAudioQuality(measureAudioQuality({ frameRms: frames })) === 'faint' ? 'faint' : null
}

/**
 * 녹음 중 품질 판정 (references/architecture.md "녹음 품질 안내").
 * WAV에 쓰는 것과 같은 샘플을 받아 50ms 프레임 RMS를 최근 180초만큼 들고, 청크마다 판정을 돌려준다.
 */
export const createQualityMonitor = () => {
  let frames: number[] = []
  // 청크 길이가 프레임의 배수가 아니라 남는 샘플은 다음 청크 앞에 붙인다
  let carry = new Float32Array(0)

  const push = (samples: Float32Array) => {
    const pending = new Float32Array(carry.length + samples.length)
    pending.set(carry)
    pending.set(samples, carry.length)

    const frameCount = Math.floor(pending.length / FRAME_SAMPLES)
    const added = Array.from({ length: frameCount }, (_, index) =>
      rmsOf(pending.subarray(index * FRAME_SAMPLES, (index + 1) * FRAME_SAMPLES))
    )
    carry = pending.slice(frameCount * FRAME_SAMPLES)
    frames = [...frames, ...added].slice(-FAINT_WINDOW_FRAMES)

    return issueOf(frames)
  }

  return { push }
}

export type QualityMonitor = ReturnType<typeof createQualityMonitor>
