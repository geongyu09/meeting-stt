import type { RefineStage } from '../types'

/** 교정 패널 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const refineKo = {
  sectionLabel: '회의록 교정',
  title: '교정',
  runningCaption: ({ percent }: { percent: number }) => `교정 중 ${percent}%`,
  groupCountCaption: ({ count }: { count: number }) => `${count}가지 고침`,
  progressLabel: '교정 진행률',
  /** 진행 중에 보여 줄 안내. 'done'·'error'는 본문이 대신 바뀌므로 짧게 둔다 */
  stages: {
    read: '용어의 한글 읽기를 정하는 중입니다',
    verify: '후보가 문맥에 맞는지 판정하는 중입니다',
    done: '교정을 마쳤습니다',
    error: '교정에 실패했습니다'
  } satisfies Record<RefineStage, string>,
  prepareInSettings: '설정에서 준비하기',
  noTermsLink: '설정에서 전역 용어를 저장',
  noTermsAfter: '하면 회의록이 만들어질 때 자동으로 교정합니다',
  notRefined: '아직 교정하지 않은 회의입니다',
  nothingFound: '고칠 곳을 찾지 못했습니다',
  applied: ({ termCount }: { termCount: number }) =>
    `전역 용어 ${termCount}개를 근거로 잘못 받아 적은 말을 자동으로 고쳤습니다. 잘못 고친 곳은 발화를 직접 편집해 되돌릴 수 있습니다`,
  listLabel: '고친 용어',
  rerun: '다시 교정',
  placeCount: ({ count }: { count: number }) => `${count}곳`,
  errors: {
    request: '교정을 시작하지 못했습니다'
  }
}

export const refineEn: typeof refineKo = {
  sectionLabel: 'Transcript correction',
  title: 'Corrections',
  runningCaption: ({ percent }) => `Correcting ${percent}%`,
  groupCountCaption: ({ count }) => `${count} ${count === 1 ? 'fix' : 'fixes'}`,
  progressLabel: 'Correction progress',
  stages: {
    read: 'Determining Korean readings of terms',
    verify: 'Checking whether candidates fit the context',
    done: 'Correction complete',
    error: 'Correction failed'
  },
  prepareInSettings: 'Set up in Settings',
  noTermsLink: 'Save global terms in Settings',
  noTermsAfter: ' to correct transcripts automatically when they are created',
  notRefined: 'This meeting has not been corrected yet',
  nothingFound: 'Nothing to correct was found',
  applied: ({ termCount }) =>
    `Misheard words were corrected automatically using ${termCount} global ${termCount === 1 ? 'term' : 'terms'}. Undo a wrong fix by editing the utterance directly`,
  listLabel: 'Corrected terms',
  rerun: 'Correct again',
  placeCount: ({ count }) => `${count} ${count === 1 ? 'place' : 'places'}`,
  errors: {
    request: 'Could not start the correction'
  }
}
