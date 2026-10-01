import type { SummaryBlockKind } from '../types'

/**
 * 요약 템플릿 문구 — 설정의 "요약 템플릿" 카테고리, 요약 카드의 템플릿 선택, 저장 요청 검증 오류.
 * ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어").
 * 블록의 기본 제목과 AI 지시문은 요약 언어가 한국어라 번역하지 않는다 (`src/shared/summaryTemplate.ts`).
 */
export const summaryTemplateKo = {
  defaultName: '기본',
  blocks: {
    oneLine: { name: '한 줄 요약', description: '회의 전체를 한 문장으로' },
    overview: { name: '핵심 요약', description: '가장 중요한 것부터 5개 이내' },
    topics: { name: '논의 사항', description: '주제마다 무엇을 논의했고 결론이 무엇인지' },
    speakers: { name: '참석자별 발언', description: '참석자마다 주요 의견' },
    decisions: { name: '결정 사항', description: '회의에서 확정된 것만' },
    actions: { name: '다음 할 일', description: '할 일과 담당자·기한 (회의록에 나온 경우만)' },
    openQuestions: { name: '미해결 · 보류', description: '결론이 나지 않았거나 미룬 것' },
    numbers: { name: '숫자 · 일정', description: '회의록에 나온 수치·날짜를 그대로' },
    quotes: { name: '주요 발언', description: '핵심 발언을 원문 그대로 인용' },
    custom: { name: '직접 적기', description: '무엇을 적을지 한 줄로 정하기' }
  } satisfies Record<SummaryBlockKind, { name: string; description: string }>,
  section: {
    title: '요약 템플릿',
    intro:
      '블록을 위에서부터 쌓아 요약 결과의 모양을 정합니다. 만든 템플릿은 회의 요약을 만들 때 고를 수 있습니다.',
    loading: '요약 템플릿을 불러오는 중입니다',
    listLabel: '템플릿 목록',
    builtInGroup: '기본 제공',
    userGroup: '내 템플릿',
    newTemplate: '새 템플릿',
    duplicate: '복제해서 만들기',
    builtInHint: '기본 템플릿은 고칠 수 없습니다. 복제해서 새 템플릿으로 만들어 주세요.',
    nameLabel: '템플릿 이름',
    namePlaceholder: '예: 주간 회의',
    newName: '새 템플릿',
    copyName: ({ name }: { name: string }) => `${name} 복사본`,
    paletteLabel: '블록 모음',
    paletteHint:
      '오른쪽 원하는 자리로 끌어다 놓거나, 누르면 맨 아래에 붙습니다. 같은 블록은 한 번만 넣을 수 있습니다.',
    stackLabel: '쌓인 블록',
    stackHint: '위에서부터 순서대로 요약에 들어갑니다. 손잡이를 끌거나 ↑↓ 버튼으로 옮깁니다.',
    emptyStack: '왼쪽 블록 모음에서 블록을 끌어다 여기에 놓아 주세요',
    blockCount: ({ count, max }: { count: number; max: number }) => `${count}/${max}개`,
    manyBlocksWarning: '로컬 모델은 블록이 많으면 일부를 빠뜨릴 수 있어요',
    previewLabel: '결과 미리보기',
    promptToggle: 'AI에게 보내는 지시 보기',
    saving: '저장하는 중…',
    save: '저장',
    unsaved: '저장하지 않은 변경이 있습니다',
    delete: '삭제',
    confirmDelete: '정말 삭제',
    cancel: '취소',
    close: '닫기'
  },
  block: {
    headingLabel: ({ position }: { position: number }) => `블록 ${position} 제목`,
    descriptionLabel: ({ position }: { position: number }) => `블록 ${position} 설명`,
    descriptionPlaceholder: '예: 다음 회의 안건',
    moveUp: ({ position }: { position: number }) => `블록 ${position} 위로`,
    moveDown: ({ position }: { position: number }) => `블록 ${position} 아래로`,
    remove: ({ position }: { position: number }) => `블록 ${position} 빼기`,
    add: ({ name }: { name: string }) => `${name} 블록 추가`
  },
  picker: {
    label: '요약 템플릿'
  },
  page: {
    backToSettings: '설정으로'
  },
  settingsEntry: {
    title: '템플릿 편집',
    description: ({ count }: { count: number }) =>
      count === 0
        ? '아직 만든 템플릿이 없습니다. 기본 템플릿만 쓸 수 있습니다.'
        : `내가 만든 템플릿 ${count}개`,
    manage: '템플릿 관리'
  },
  actions: {
    loadError: '요약 템플릿을 불러오지 못했습니다',
    saveError: '요약 템플릿을 저장하지 못했습니다',
    deleteError: '요약 템플릿을 삭제하지 못했습니다',
    saved: ({ name }: { name: string }) => `"${name}" 템플릿을 저장했습니다`,
    deleted: ({ name }: { name: string }) => `"${name}" 템플릿을 삭제했습니다`
  },
  errors: {
    invalidRequest: '잘못된 요청입니다 (요약 템플릿 형식 오류)',
    emptyName: '템플릿 이름을 적어 주세요',
    nameTooLong: ({ max }: { max: number }) => `템플릿 이름은 ${max}자까지 적을 수 있습니다`,
    duplicateName: '같은 이름의 템플릿이 이미 있습니다',
    tooManyTemplates: ({ max }: { max: number }) => `템플릿은 ${max}개까지 만들 수 있습니다`,
    noBlocks: '블록을 하나 이상 쌓아 주세요',
    tooManyBlocks: ({ max }: { max: number }) => `블록은 ${max}개까지 쌓을 수 있습니다`,
    duplicateBlock: ({ name }: { name: string }) => `"${name}" 블록은 한 번만 넣을 수 있습니다`,
    emptyHeading: '블록 제목을 적어 주세요',
    headingTooLong: ({ max }: { max: number }) => `블록 제목은 ${max}자까지 적을 수 있습니다`,
    invalidHeading: '블록 제목에는 줄바꿈과 #을 쓸 수 없습니다',
    emptyDescription: '직접 적기 블록에 무엇을 적을지 적어 주세요',
    descriptionTooLong: ({ max }: { max: number }) =>
      `직접 적기 설명은 ${max}자까지 적을 수 있습니다`,
    invalidDescription: '직접 적기 설명에는 줄바꿈을 쓸 수 없습니다',
    builtIn: '기본 템플릿은 고치거나 삭제할 수 없습니다',
    notFound: '요약 템플릿을 찾을 수 없습니다'
  }
}

export const summaryTemplateEn: typeof summaryTemplateKo = {
  defaultName: 'Default',
  blocks: {
    oneLine: { name: 'One-line summary', description: 'The whole meeting in one sentence' },
    overview: { name: 'Key points', description: 'Up to 5, most important first' },
    topics: { name: 'Topics', description: 'What was discussed and concluded per topic' },
    speakers: { name: 'By participant', description: "Each participant's main points" },
    decisions: { name: 'Decisions', description: 'Only what was settled' },
    actions: {
      name: 'Next steps',
      description: 'Tasks with owners and due dates (only if mentioned)'
    },
    openQuestions: { name: 'Open · On hold', description: 'Unresolved or postponed items' },
    numbers: { name: 'Numbers · Dates', description: 'Figures and dates exactly as said' },
    quotes: { name: 'Key quotes', description: 'Important remarks quoted verbatim' },
    custom: { name: 'Custom', description: 'Describe what to write in one line' }
  },
  section: {
    title: 'Summary templates',
    intro:
      'Stack blocks from top to bottom to shape the summary. You can pick a template when creating a meeting summary.',
    loading: 'Loading summary templates',
    listLabel: 'Templates',
    builtInGroup: 'Built-in',
    userGroup: 'My templates',
    newTemplate: 'New template',
    duplicate: 'Duplicate',
    builtInHint: 'The default template cannot be edited. Duplicate it to make a new template.',
    nameLabel: 'Template name',
    namePlaceholder: 'e.g. Weekly sync',
    newName: 'New template',
    copyName: ({ name }) => `${name} copy`,
    paletteLabel: 'Blocks',
    paletteHint:
      'Drag a block to where you want it, or click to add it at the bottom. Each block can be added once.',
    stackLabel: 'Stacked blocks',
    stackHint:
      'Blocks appear in the summary from top to bottom. Drag the handle or use ↑↓ to reorder.',
    emptyStack: 'Drag blocks from the list on the left and drop them here',
    blockCount: ({ count, max }) => `${count}/${max}`,
    manyBlocksWarning: 'The local model may skip some blocks when there are many',
    previewLabel: 'Preview',
    promptToggle: 'Show instructions sent to the AI',
    saving: 'Saving…',
    save: 'Save',
    unsaved: 'You have unsaved changes',
    delete: 'Delete',
    confirmDelete: 'Delete for good',
    cancel: 'Cancel',
    close: 'Close'
  },
  block: {
    headingLabel: ({ position }) => `Block ${position} heading`,
    descriptionLabel: ({ position }) => `Block ${position} description`,
    descriptionPlaceholder: 'e.g. Agenda for the next meeting',
    moveUp: ({ position }) => `Move block ${position} up`,
    moveDown: ({ position }) => `Move block ${position} down`,
    remove: ({ position }) => `Remove block ${position}`,
    add: ({ name }) => `Add ${name} block`
  },
  picker: {
    label: 'Summary template'
  },
  page: {
    backToSettings: 'Settings'
  },
  settingsEntry: {
    title: 'Edit templates',
    description: ({ count }: { count: number }) =>
      count === 0
        ? 'No templates yet. Only the default template is available.'
        : `${count} ${count === 1 ? 'template' : 'templates'} created`,
    manage: 'Manage templates'
  },
  actions: {
    loadError: 'Could not load summary templates',
    saveError: 'Could not save the summary template',
    deleteError: 'Could not delete the summary template',
    saved: ({ name }) => `Saved "${name}"`,
    deleted: ({ name }) => `Deleted "${name}"`
  },
  errors: {
    invalidRequest: 'Invalid request (summary template has the wrong shape)',
    emptyName: 'Enter a template name',
    nameTooLong: ({ max }) => `Template names can be up to ${max} characters`,
    duplicateName: 'A template with this name already exists',
    tooManyTemplates: ({ max }) => `Up to ${max} templates can be created`,
    noBlocks: 'Stack at least one block',
    tooManyBlocks: ({ max }) => `Up to ${max} blocks can be stacked`,
    duplicateBlock: ({ name }) => `The "${name}" block can be added only once`,
    emptyHeading: 'Enter a block heading',
    headingTooLong: ({ max }) => `Block headings can be up to ${max} characters`,
    invalidHeading: 'Block headings cannot contain line breaks or #',
    emptyDescription: 'Describe what the custom block should contain',
    descriptionTooLong: ({ max }) => `Custom descriptions can be up to ${max} characters`,
    invalidDescription: 'Custom descriptions cannot contain line breaks',
    builtIn: 'The default template cannot be edited or deleted',
    notFound: 'Summary template not found'
  }
}
