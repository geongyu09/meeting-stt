import type { SummaryStage } from '../types'

/** 요약 패널 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const summaryKo = {
  sectionLabel: '회의 요약',
  title: '요약',
  runningCaption: ({ percent }: { percent: number }) => `요약 중 ${percent}%`,
  progressLabel: '요약 진행률',
  /** 진행 중에 보여 줄 안내. 'done'·'error'는 본문이 대신 바뀌므로 짧게 둔다 */
  stages: {
    summarize: '회의록을 읽고 요약하는 중입니다',
    reduce: '구간별 요약을 하나로 정리하는 중입니다',
    done: '요약을 마쳤습니다',
    error: '요약에 실패했습니다'
  } satisfies Record<SummaryStage, string>,
  noUtterances: '요약할 발화가 없습니다',
  prepareInSettings: '설정에서 준비하기',
  fallbackProvider: '선택한 모델',
  empty: ({ provider }: { provider: string }) =>
    `아직 요약이 없습니다. 회의록을 ${provider}로 요약하며, 회의 길이에 따라 몇 분이 걸립니다`,
  copied: '복사됨',
  copy: '요약 복사',
  regenerate: '다시 요약',
  create: '요약 만들기',
  errors: {
    request: '요약을 시작하지 못했습니다',
    copy: '요약을 복사하지 못했습니다'
  }
}

export const summaryEn: typeof summaryKo = {
  sectionLabel: 'Meeting summary',
  title: 'Summary',
  runningCaption: ({ percent }) => `Summarizing ${percent}%`,
  progressLabel: 'Summary progress',
  stages: {
    summarize: 'Reading and summarizing the transcript',
    reduce: 'Combining section summaries into one',
    done: 'Summary complete',
    error: 'Summary failed'
  },
  noUtterances: 'There is nothing to summarize',
  prepareInSettings: 'Set up in Settings',
  fallbackProvider: 'the selected model',
  empty: ({ provider }) =>
    `No summary yet. The transcript will be summarized with ${provider}; this can take a few minutes depending on the meeting length`,
  copied: 'Copied',
  copy: 'Copy summary',
  regenerate: 'Summarize again',
  create: 'Create summary',
  errors: {
    request: 'Could not start the summary',
    copy: 'Could not copy the summary'
  }
}
