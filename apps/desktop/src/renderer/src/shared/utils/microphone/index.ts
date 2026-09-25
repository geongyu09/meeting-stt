import type { AudioInputDevice } from '@shared/types'
import { CHANNELS, SAMPLE_RATE_HZ } from '@shared/audio'
import { DEFAULT_LOCALE, getMessages, type Messages } from '@shared/i18n'

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
  /** 실패 문구의 언어. 훅이 `useLocale()`의 `t`를 넘긴다. 없으면 기본 언어 */
  t?: Messages
}

/**
 * 마이크 스트림과 16kHz AudioContext를 함께 연다. `AudioContext`가 16kHz 요청을 무시하면
 * 잡은 것을 모두 놓고 실패시킨다 (references/pitfalls.md). 그래프 연결은 호출한 쪽이 한다.
 */
export const openMicrophone = async ({
  inputDevice,
  t = getMessages(DEFAULT_LOCALE)
}: OpenMicrophoneParams) => {
  const stream = await navigator.mediaDevices.getUserMedia(
    buildMicrophoneConstraints({ inputDevice })
  )
  const context = new AudioContext({ sampleRate: SAMPLE_RATE_HZ })

  if (context.sampleRate !== SAMPLE_RATE_HZ) {
    stream.getTracks().forEach((track) => track.stop())
    await context.close()
    throw new Error(
      t.recording.errors.sampleRateUnsupported({
        expected: SAMPLE_RATE_HZ,
        actual: context.sampleRate
      })
    )
  }

  return { stream, context }
}
