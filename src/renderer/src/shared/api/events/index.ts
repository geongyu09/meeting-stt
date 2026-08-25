import type { PipelineProgressEvent } from '@shared/ipc'

/**
 * @description 파이프라인 진행률·상태 이벤트를 구독합니다.
 * @param listener - 진행률 이벤트 콜백
 * @returns 구독 해제 함수
 * @example
 * useEffect(() => onPipelineProgress(({ stage }) => refetchOn(stage)), [refetchOn])
 */
export const onPipelineProgress = (listener: (event: PipelineProgressEvent) => void) =>
  window.api.events.onPipelineProgress(listener)
