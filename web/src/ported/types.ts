/**
 * `main`의 `src/shared/types.ts`에서 파이프라인 중간 산출물만 가져온 것.
 * Meeting·Utterance·설정 같은 제품 타입은 프로토타입 범위 밖이라 뺐다 (docs/browser-prototype-plan.md §2).
 */

export interface SttWord {
  start: number
  end: number
  text: string
}

export interface SttSegment {
  start: number
  end: number
  text: string
  words?: SttWord[]
}

export interface SpeakerSegment {
  start: number
  end: number
  speaker: string
}

/** 화자가 배정된 조각. 병합 전 단계 */
export interface SpeakerPiece {
  speaker: string
  start: number
  end: number
  text: string
}

/** 데스크탑에서는 `Omit<Utterance, 'id' | 'meetingId'>`였다. DB가 없으므로 직접 적는다 */
export interface MergedUtterance {
  ord: number
  speakerLabel: string
  startSec: number
  endSec: number
  text: string
}
