export interface LoadedDocument {
  path: string
  /** 마지막으로 디스크에서 읽었거나 디스크에 쓴 내용 */
  saved: string
  draft: string
  /** 편집 중에 다른 곳(에이전트)이 파일을 바꿨다. 사용자가 다시 읽거나 저장할 때까지 자동 저장하지 않는다 */
  hasExternalChange: boolean
}
