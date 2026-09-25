import { isValidSpeakerCount } from '@meeting-stt/core/speakerCount'

/** 빈 입력은 "모름"(null, 임계값 폴백). 그 외는 정수 범위 검사를 통과해야 유효하다 */
export const parseSpeakerCountText = (text: string) => {
  if (text.trim() === '') return { speakerCount: null, isValid: true }

  const value = Number(text.trim())

  return isValidSpeakerCount(value)
    ? { speakerCount: value, isValid: true }
    : { speakerCount: null, isValid: false }
}
