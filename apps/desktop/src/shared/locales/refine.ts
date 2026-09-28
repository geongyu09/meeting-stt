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
    sentence: '문장을 읽고 잘못 받아 적은 말을 고치는 중입니다',
    done: '교정을 마쳤습니다',
    error: '교정에 실패했습니다'
  } satisfies Record<RefineStage, string>,
  prepareInSettings: '설정에서 준비하기',
  noTermsLink: '설정에서 전역 용어를 저장',
  noTermsAfter: '하면 회의록이 만들어질 때 자동으로 교정합니다',
  notRefined: '아직 교정하지 않은 회의입니다',
  nothingFound: '고칠 곳을 찾지 못했습니다',
  applied: ({ termCount }: { termCount: number }) =>
    `전역 용어 ${termCount}개를 근거로 잘못 받아 적은 말을 자동으로 고쳤습니다. 잘못 고친 곳은 발화의 "교정됨" 표시에서 원문으로 되돌릴 수 있습니다`,
  appliedSentence:
    '문장 뜻을 보고 잘못 받아 적은 말을 자동으로 고쳤습니다. 잘못 고친 곳은 발화의 "교정됨" 표시에서 원문으로 되돌릴 수 있습니다',
  localHint:
    '로컬 모델은 용어 사전의 단어만 고칩니다. 문장까지 고치려면 설정에서 외부 공급자를 고르세요',
  listLabel: '고친 용어',
  rerun: '다시 교정',
  placeCount: ({ count }: { count: number }) => `${count}곳`,
  autoToggle: {
    title: '회의록을 만들면 자동으로 교정',
    description:
      '회의록이 만들어질 때마다 문장 뜻을 보고 잘못 받아 적은 말을 고칩니다. 켜면 회의가 끝날 때마다 회의록이 선택한 공급자 서버로 전송됩니다. 꺼 두어도 회의 상세의 "다시 교정"으로 직접 교정할 수 있습니다'
  },
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
    sentence: 'Reading sentences and fixing misheard words',
    done: 'Correction complete',
    error: 'Correction failed'
  },
  prepareInSettings: 'Set up in Settings',
  noTermsLink: 'Save global terms in Settings',
  noTermsAfter: ' to correct transcripts automatically when they are created',
  notRefined: 'This meeting has not been corrected yet',
  nothingFound: 'Nothing to correct was found',
  applied: ({ termCount }) =>
    `Misheard words were corrected automatically using ${termCount} global ${termCount === 1 ? 'term' : 'terms'}. Revert a wrong fix from the utterance's "Corrected" tag`,
  appliedSentence:
    'Misheard words were corrected automatically by reading each sentence. Revert a wrong fix from the utterance\'s "Corrected" tag',
  localHint:
    'The local model only fixes glossary words. Choose an external provider in Settings to correct whole sentences',
  listLabel: 'Corrected terms',
  rerun: 'Correct again',
  placeCount: ({ count }) => `${count} ${count === 1 ? 'place' : 'places'}`,
  autoToggle: {
    title: 'Correct transcripts automatically',
    description:
      'Fixes misheard words by reading each sentence whenever a transcript is created. When on, every transcript is sent to the selected provider after each meeting. You can still correct a meeting yourself with "Correct again" when this is off'
  },
  errors: {
    request: 'Could not start the correction'
  }
}
