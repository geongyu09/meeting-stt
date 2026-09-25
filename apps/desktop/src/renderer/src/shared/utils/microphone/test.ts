import { describe, expect, it } from 'vitest'
import { buildMicrophoneConstraints } from './index'

describe('buildMicrophoneConstraints', () => {
  it('장치를 고르지 않았으면 deviceId 없이 모노·잡음 억제 제약만 만든다', () => {
    const { audio } = buildMicrophoneConstraints({ inputDevice: null })

    expect(audio).toEqual({ channelCount: 1, echoCancellation: true, noiseSuppression: true })
    expect('deviceId' in audio).toBe(false)
  })

  it('고른 장치는 exact가 아니라 ideal로 요청해 빠져 있으면 기본 마이크로 폴백하게 한다', () => {
    const { audio } = buildMicrophoneConstraints({
      inputDevice: { deviceId: 'abc123', label: 'USB 마이크' }
    })

    expect(audio.deviceId).toEqual({ ideal: 'abc123' })
    expect(audio.channelCount).toBe(1)
  })
})
