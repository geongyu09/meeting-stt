import type { AudioInputDevice } from '@shared/types'
import { CHANNELS, SAMPLE_RATE_HZ } from '@shared/audio'

interface BuildMicrophoneConstraintsParams {
  inputDevice: AudioInputDevice | null
}

/**
 * 녹음과 마이크 테스트가 같은 제약으로 마이크를 연다 (references/architecture.md "마이크 입력 장치와 테스트").
 * 장치는 `ideal`로만 요청한다 — 골라 둔 마이크가 빠져 있으면 녹음이 실패하는 대신 시스템 기본 마이크로 폴백한다.
 */
export const buildMicrophoneConstraints = ({ inputDevice }: BuildMicrophoneConstraintsParams) => ({
  audio: {
    channelCount: CHANNELS,
    echoCancellation: true,
    noiseSuppression: true,
    ...(inputDevice ? { deviceId: { ideal: inputDevice.deviceId } } : {})
  }
})

interface OpenMicrophoneParams {
  inputDevice: AudioInputDevice | null
}

/**
 * 마이크 스트림과 16kHz AudioContext를 함께 연다. `AudioContext`가 16kHz 요청을 무시하면
 * 잡은 것을 모두 놓고 실패시킨다 (references/pitfalls.md). 그래프 연결은 호출한 쪽이 한다.
 */
export const openMicrophone = async ({ inputDevice }: OpenMicrophoneParams) => {
  const stream = await navigator.mediaDevices.getUserMedia(
    buildMicrophoneConstraints({ inputDevice })
  )
  const context = new AudioContext({ sampleRate: SAMPLE_RATE_HZ })

  if (context.sampleRate !== SAMPLE_RATE_HZ) {
    stream.getTracks().forEach((track) => track.stop())
    await context.close()
    throw new Error(
      `이 마이크는 ${SAMPLE_RATE_HZ}Hz 녹음을 지원하지 않습니다 (현재 ${context.sampleRate}Hz)`
    )
  }

  return { stream, context }
}
