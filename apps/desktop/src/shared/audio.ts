/**
 * 이 앱의 녹음 파라미터. 오디오 형식(16kHz mono 16bit)은 두 앱이 공유하므로
 * `@meeting-stt/core/audio`에 있고, 기존 import 경로를 유지하려고 여기서 재노출한다.
 */

import type { AudioInputDevice, RecordingType } from './types'

export { BITS_PER_SAMPLE, CHANNELS, SAMPLE_RATE_HZ } from '@meeting-stt/core/audio'

/** AudioWorklet이 한 번에 모아 보내는 샘플 수. 16kHz에서 약 0.5초 분량 */
export const CHUNK_SAMPLES = 8192

/**
 * 청크 하나의 RMS(0~1). 레벨 미터 값을 main이 계산해 두 창에 같은 값을 보내기 위한 순수 함수다
 * (references/architecture.md의 "녹음 위젯 패널").
 */
export const rmsOf = (samples: Float32Array) => {
  if (samples.length === 0) return 0

  let sum = 0
  for (const sample of samples) sum += sample * sample

  return Math.sqrt(sum / samples.length)
}

/** Chromium의 deviceId 해시와 장치 이름 길이 상한. 저장·검증이 같은 값을 쓴다 (references/data-model.md) */
export const INPUT_DEVICE_ID_MAX_LENGTH = 200
export const INPUT_DEVICE_LABEL_MAX_LENGTH = 200

/** 설정 `audio.inputDevice`의 모양 검증. main의 읽기와 저장 검증이 함께 쓴다 */
export const isAudioInputDevice = (value: unknown): value is AudioInputDevice => {
  if (typeof value !== 'object' || value === null) return false

  const { deviceId, label } = value as Record<string, unknown>

  return (
    typeof deviceId === 'string' &&
    deviceId.length > 0 &&
    deviceId.length <= INPUT_DEVICE_ID_MAX_LENGTH &&
    typeof label === 'string' &&
    label.length <= INPUT_DEVICE_LABEL_MAX_LENGTH
  )
}

/** 답변 읽어주기 목소리(`voiceURI`) 길이 상한. 저장·검증이 같은 값을 쓴다 (references/data-model.md `speech.voice`) */
export const SPEECH_VOICE_MAX_LENGTH = 200

/** 설정 `speech.voice`의 형식 검증. main의 읽기와 저장 검증이 함께 쓴다 */
export const isSpeechVoice = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= SPEECH_VOICE_MAX_LENGTH

/** 처음 녹음의 종류. 피벗 방향(빠른 기록)에 맞춰 메모다 (references/features/assistant.md "녹음 종류 (회의 / 메모)") */
export const DEFAULT_RECORDING_TYPE: RecordingType = 'memo'

/** 녹음 종류 검증. main의 설정 읽기·`recording:setType`·DB 행 읽기가 함께 쓴다 */
export const isRecordingType = (value: unknown): value is RecordingType =>
  value === 'meeting' || value === 'memo'
