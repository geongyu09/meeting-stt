import type { RunRefineRequest } from '@shared/ipc'

/**
 * @description 회의록 자동 교정을 다시 실행합니다. 파이프라인이 끝나면 main이 알아서 돌리므로, 용어 사전을 고친 뒤
 * 기존 회의를 다시 교정할 때만 부릅니다. 잡을 큐에 넣은 뒤 즉시 반환하며, 진행과 완료는 `onRefineProgress`로 옵니다.
 * @param meetingId - 회의 ID
 * @returns 없음
 * @example
 * await runRefineApi({ meetingId })
 */
export const runRefineApi = async ({ meetingId }: RunRefineRequest) => {
  await window.api.refine.run({ meetingId })
}
