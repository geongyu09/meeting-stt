/** 대화에서 한 기록 찾기 한 번. 저장하지 않는 renderer 로컬 상태다 (references/features/recording.md "기록 찾기") */
export interface RecordSearch {
  /** 찾기를 한 시각(epoch ms). 기록 카드와 시각 순으로 섞이는 기준이고 key로도 쓴다 */
  at: number
  query: string
}
