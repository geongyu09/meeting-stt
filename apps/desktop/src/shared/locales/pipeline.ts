import type { PipelineStage } from '../types'

/** 파이프라인 진행률 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const pipelineKo = {
  stages: {
    stt: '음성 인식 중',
    diarize: '화자 구분 중',
    merge: '회의록 정리 중',
    save: '저장 중',
    done: '완료',
    error: '오류'
  } satisfies Record<PipelineStage, string>,
  /** 아직 진행률 이벤트가 오지 않은 상태. 앞선 회의를 처리 중이거나 막 시작한 참이다 */
  waiting: '차례를 기다리는 중',
  progressLabel: '회의록 만드는 중'
}

export const pipelineEn: typeof pipelineKo = {
  stages: {
    stt: 'Transcribing',
    diarize: 'Identifying speakers',
    merge: 'Assembling transcript',
    save: 'Saving',
    done: 'Done',
    error: 'Error'
  },
  waiting: 'Waiting in queue',
  progressLabel: 'Creating transcript'
}
