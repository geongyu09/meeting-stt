/** 루틴(설정 묶음·알림·오류) 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const routineKo = {
  settings: {
    title: '루틴',
    listTitle: '내 루틴',
    description:
      '정해진 주기마다 작업 폴더에서 에이전트에게 프롬프트를 보냅니다. 앱이 켜져 있을 때만 돌고(창을 닫아도 메뉴바에 남습니다), 앱이 꺼져 있던 동안 놓친 실행은 켜진 뒤 한 번만 돕니다. 프롬프트와 에이전트가 읽은 파일 내용은 Anthropic·OpenAI 서버로 전송됩니다.',
    noFolder: '작업 폴더를 먼저 고르세요. 루틴은 작업 폴더에서 돕니다.',
    empty: '아직 루틴이 없습니다.',
    add: '루틴 추가',
    loading: '불러오는 중',
    loadError: '루틴을 불러오지 못했습니다',
    actionError: '루틴을 바꾸지 못했습니다'
  },
  row: {
    toggle: ({ name }: { name: string }) => `${name} 켜기`,
    runNow: '지금 실행',
    running: '실행 중',
    queued: '대기 중',
    edit: '고치기',
    delete: '삭제',
    confirmDelete: '정말 삭제',
    cancel: '취소',
    nextRun: ({ when }: { when: string }) => `다음 실행 ${when}`,
    neverRun: '아직 실행하지 않았습니다',
    lastRunDone: ({ when }: { when: string }) => `마지막 실행 ${when} · 완료`,
    lastRunFailed: ({ when, reason }: { when: string; reason: string }) =>
      `마지막 실행 ${when} · 실패: ${reason}`,
    lastAnswer: '마지막 답 보기',
    noAnswer: '답변 글이 없습니다.',
    changedFiles: '바뀐 파일'
  },
  schedule: {
    weekdayNames: ['일', '월', '화', '수', '목', '금', '토'],
    daySeparator: '·',
    everyDay: '매일',
    weekdaysOnly: '평일',
    time: ({ days, time }: { days: string; time: string }) => `${days} ${time}`,
    everyMinutes: ({ count }: { count: number }) => `${count}분마다`,
    everyHours: ({ count }: { count: number }) => `${count}시간마다`
  },
  form: {
    newTitle: '새 루틴',
    editTitle: '루틴 고치기',
    name: '이름',
    namePlaceholder: '아침 브리핑',
    prompt: '프롬프트',
    promptPlaceholder: '오늘 할 일과 지난 기록을 정리해서 notes/today.md에 적어 줘',
    scheduleKind: '주기',
    kindTime: '시각',
    kindInterval: '간격',
    weekdays: '요일',
    timeOfDay: '실행 시각',
    intervalCount: '간격',
    intervalUnit: '단위',
    units: { minutes: '분마다', hours: '시간마다' },
    save: '저장',
    cancel: '취소',
    saveError: '루틴을 저장하지 못했습니다'
  },
  notification: {
    failed: ({ reason }: { reason: string }) => `실패: ${reason}`,
    noAnswer: '끝났습니다'
  },
  errors: {
    invalidRoutine: '루틴 형식이 올바르지 않습니다',
    invalidName: '이름을 1~40자로 적어 주세요',
    emptyPrompt: '프롬프트가 비어 있습니다',
    promptTooLong: '프롬프트가 너무 깁니다',
    invalidSchedule:
      '주기가 올바르지 않습니다. 요일을 하나 이상 고르거나 간격을 10분~24시간으로 적어 주세요',
    notFound: '루틴을 찾지 못했습니다',
    timeout: '10분 안에 끝나지 않아 중지했습니다'
  }
}

export const routineEn: typeof routineKo = {
  settings: {
    title: 'Routines',
    listTitle: 'Your routines',
    description:
      'Sends a prompt to the agent in your work folder on a schedule. Routines run only while the app is open (it stays in the menu bar when you close the window); a run missed while the app was closed happens once when it opens. Prompts and the files the agent reads are sent to Anthropic or OpenAI servers.',
    noFolder: 'Choose a work folder first. Routines run in the work folder.',
    empty: 'No routines yet.',
    add: 'Add routine',
    loading: 'Loading',
    loadError: 'Could not load routines',
    actionError: 'Could not change the routine'
  },
  row: {
    toggle: ({ name }) => `Turn on ${name}`,
    runNow: 'Run now',
    running: 'Running',
    queued: 'Queued',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: 'Delete for good',
    cancel: 'Cancel',
    nextRun: ({ when }) => `Next run ${when}`,
    neverRun: 'Has not run yet',
    lastRunDone: ({ when }) => `Last run ${when} · Done`,
    lastRunFailed: ({ when, reason }) => `Last run ${when} · Failed: ${reason}`,
    lastAnswer: 'Show last answer',
    noAnswer: 'No answer text.',
    changedFiles: 'Changed files'
  },
  schedule: {
    weekdayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    daySeparator: ', ',
    everyDay: 'Every day',
    weekdaysOnly: 'Weekdays',
    time: ({ days, time }) => `${days} ${time}`,
    everyMinutes: ({ count }) => `Every ${count} min`,
    everyHours: ({ count }) => `Every ${count} h`
  },
  form: {
    newTitle: 'New routine',
    editTitle: 'Edit routine',
    name: 'Name',
    namePlaceholder: 'Morning briefing',
    prompt: 'Prompt',
    promptPlaceholder: "Summarize today's tasks and recent notes into notes/today.md",
    scheduleKind: 'Schedule',
    kindTime: 'At a time',
    kindInterval: 'Interval',
    weekdays: 'Days',
    timeOfDay: 'Time',
    intervalCount: 'Interval',
    intervalUnit: 'Unit',
    units: { minutes: 'minutes', hours: 'hours' },
    save: 'Save',
    cancel: 'Cancel',
    saveError: 'Could not save the routine'
  },
  notification: {
    failed: ({ reason }) => `Failed: ${reason}`,
    noAnswer: 'Finished'
  },
  errors: {
    invalidRoutine: 'The routine is not valid',
    invalidName: 'Use a name of 1 to 40 characters',
    emptyPrompt: 'The prompt is empty',
    promptTooLong: 'The prompt is too long',
    invalidSchedule:
      'The schedule is not valid. Pick at least one day, or an interval between 10 minutes and 24 hours',
    notFound: 'Could not find the routine',
    timeout: 'Stopped because it did not finish within 10 minutes'
  }
}
