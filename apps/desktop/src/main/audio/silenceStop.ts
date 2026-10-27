import { judgeSpeech } from './liveWindow'

/**
 * 말소리가 이만큼 이어서 없으면 녹음을 정지한다. 실제 녹음 65편의 최장 무음이 3.9분이었다
 * (references/features/recording.md "무음 자동 정지").
 */
export const AUTO_STOP_SILENCE_SEC = 10 * 60

export interface SilenceTracker {
  /** 소음 바닥 계산용 최근 청크 RMS (`judgeSpeech`와 같은 기록) */
  recentRms: number[]
  /** 마지막 말소리 청크 뒤로 쌓인 초 */
  silentSec: number
}

export const EMPTY_SILENCE_TRACKER: SilenceTracker = { recentRms: [], silentSec: 0 }

interface PushSilenceChunkParams {
  tracker: SilenceTracker
  rms: number
  chunkSec: number
}

/** 말소리 청크가 하나라도 오면 0부터 다시 센다 — 조용한 곳에 두고 떠난 녹음만 멈추도록 보수적으로 잰다 */
export const pushSilenceChunk = ({ tracker, rms, chunkSec }: PushSilenceChunkParams) => {
  const { recentRms, isSpeech } = judgeSpeech({ recentRms: tracker.recentRms, rms })
  const silentSec = isSpeech ? 0 : tracker.silentSec + chunkSec

  return {
    tracker: { recentRms, silentSec },
    isSilentTooLong: silentSec >= AUTO_STOP_SILENCE_SEC
  }
}
