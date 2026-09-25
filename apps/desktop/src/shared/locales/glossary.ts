/**
 * 전역 용어 사전 문구 — 설정의 "용어 사전" 카테고리와 저장 요청 검증 오류.
 * ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어").
 * LLM 초안 프롬프트·문법은 인식 대상이 한국어 회의라 번역하지 않는다 (`src/shared/glossary.ts`).
 */
export const glossaryKo = {
  section: {
    title: '용어 사전',
    intro:
      '회의에 자주 나오는 영어 용어·제품 이름·약어를 적어 두면 회의록 교정에 씁니다. 팀 소개를 적고 초안을 만들면 로컬 요약 모델이 후보를 채워 주고, 확인한 뒤 저장하면 됩니다. 초안에는 요약 모델이 필요합니다.',
    loading: '용어 사전을 불러오는 중입니다',
    teamLabel: '팀 소개',
    teamHint:
      '쓰고 있는 기술·도구·제품 이름을 영어 그대로 적을수록 초안이 정확해집니다. 적은 이름은 초안 맨 앞에 들어갑니다.',
    teamPlaceholder:
      '예: 프론트엔드 개발팀입니다. Electron, React, whisper.cpp로 회의록 앱을 만들고 pnpm 모노레포로 관리합니다.',
    drafting: '초안을 만드는 중…',
    draft: '용어 초안 만들기',
    draftHint: '10~20초 걸립니다. 회의록을 처리 중이면 그 작업이 끝난 뒤 만듭니다',
    termsLabel: ({ count, max }: { count: number; max: number }) => `용어 목록 (${count}/${max})`,
    termsHint:
      '한 칸에 용어 하나를 적습니다. 한글 읽기는 선택입니다 — 영어 용어의 읽기를 적어 두면 비워 둘 때보다 잘못 받아 적힌 말을 정확하게 찾습니다. 읽기가 여러 개면 쉼표로 잇습니다. 목록을 용어 칸에 붙여 넣으면 줄마다 나눠 넣습니다.',
    termColumn: '용어',
    readingColumn: '한글 읽기 (선택)',
    termList: '용어 목록',
    addTerm: '용어 추가',
    saving: '저장하는 중…',
    save: '저장',
    unsaved: '저장하지 않은 변경이 있습니다'
  },
  row: {
    termPlaceholder: '예: GitHub',
    readingsPlaceholder: '예: 깃허브, 기트허브',
    termLabel: ({ position }: { position: number }) => `용어 ${position}`,
    readingsLabel: ({ position }: { position: number }) => `용어 ${position} 한글 읽기`,
    removeLabel: ({ position }: { position: number }) => `용어 ${position} 삭제`
  },
  actions: {
    loadError: '용어 사전을 불러오지 못했습니다',
    saveError: '용어 사전을 저장하지 못했습니다',
    draftError: '용어 초안을 만들지 못했습니다',
    saved: ({ count }: { count: number }) => `용어 ${count}개를 저장했습니다`,
    drafted: ({ count }: { count: number }) =>
      `새 용어 ${count}개를 덧붙였습니다. 읽기가 맞는지 확인하고 저장해 주세요`,
    nothingToAdd: '새로 덧붙일 용어가 없습니다'
  },
  errors: {
    missingTeam: '잘못된 요청입니다 (팀 소개 없음)',
    teamTooLong: ({ max }: { max: number }) => `팀 소개는 ${max}자까지 적을 수 있습니다`,
    missingTerms: '잘못된 요청입니다 (용어 목록 없음)',
    invalidTerms: '잘못된 요청입니다 (용어 형식 오류)',
    termTooLong: ({ max, term }: { max: number; term: string }) =>
      `용어 한 줄은 ${max}자까지 적을 수 있습니다: ${term}`,
    tooManyTerms: ({ max }: { max: number }) => `용어는 ${max}개까지 저장할 수 있습니다`,
    emptyTeam: '팀 소개를 먼저 적어 주세요'
  }
}

export const glossaryEn: typeof glossaryKo = {
  section: {
    title: 'Glossary',
    intro:
      'List the English terms, product names and acronyms that come up in meetings, and they are used to correct transcripts. Describe your team and make a draft to let the local summary model suggest candidates, then review and save. Drafts require the summary model.',
    loading: 'Loading glossary',
    teamLabel: 'About your team',
    teamHint:
      'The more technology, tool and product names you write in English as is, the more accurate the draft. Names you write go to the top of the draft.',
    teamPlaceholder:
      'e.g. We are a frontend team building a meeting transcript app with Electron, React and whisper.cpp, managed in a pnpm monorepo.',
    drafting: 'Making a draft…',
    draft: 'Draft glossary',
    draftHint:
      'Takes 10 to 20 seconds. If a transcript is being processed, the draft starts after it',
    termsLabel: ({ count, max }: { count: number; max: number }) => `Terms (${count}/${max})`,
    termsHint:
      'One term per row. The Korean reading is optional. Adding a reading for an English term finds misrecognized words more precisely than leaving it empty. Separate multiple readings with commas. Paste a list into the term field to split it into rows.',
    termColumn: 'Term',
    readingColumn: 'Korean reading (optional)',
    termList: 'Term list',
    addTerm: 'Add term',
    saving: 'Saving…',
    save: 'Save',
    unsaved: 'You have unsaved changes'
  },
  row: {
    termPlaceholder: 'e.g. GitHub',
    readingsPlaceholder: 'e.g. 깃허브, 기트허브',
    termLabel: ({ position }: { position: number }) => `Term ${position}`,
    readingsLabel: ({ position }: { position: number }) => `Term ${position} Korean reading`,
    removeLabel: ({ position }: { position: number }) => `Remove term ${position}`
  },
  actions: {
    loadError: 'Could not load the glossary',
    saveError: 'Could not save the glossary',
    draftError: 'Could not make a glossary draft',
    saved: ({ count }: { count: number }) => `Saved ${count} terms`,
    drafted: ({ count }: { count: number }) =>
      `Added ${count} new terms. Check the readings and save`,
    nothingToAdd: 'No new terms to add'
  },
  errors: {
    missingTeam: 'Invalid request (missing team description)',
    teamTooLong: ({ max }: { max: number }) =>
      `The team description can be up to ${max} characters`,
    missingTerms: 'Invalid request (missing term list)',
    invalidTerms: 'Invalid request (terms have the wrong type)',
    termTooLong: ({ max, term }: { max: number; term: string }) =>
      `A term line can be up to ${max} characters: ${term}`,
    tooManyTerms: ({ max }: { max: number }) => `Up to ${max} terms can be saved`,
    emptyTeam: 'Describe your team first'
  }
}
