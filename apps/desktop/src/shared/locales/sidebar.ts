/** 사이드바(회의 목록·검색·날짜 묶음)와 홈 화면 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const sidebarKo = {
  nav: {
    searchResults: '검색 결과',
    meetingList: '회의 목록'
  },
  settings: '설정',
  newRecording: {
    recording: '녹음 중',
    label: '새 녹음'
  },
  listItem: {
    recording: '녹음 중',
    defaultError: '회의록을 만들지 못했습니다'
  },
  search: {
    placeholder: '회의록 검색',
    clear: '검색 지우기',
    searching: '찾는 중입니다',
    noResults: ({ query }: { query: string }) => `“${query}”이(가) 들어간 회의가 없습니다`
  },
  list: {
    empty: '아직 녹음한 회의가 없습니다. 새 녹음으로 시작해 보세요'
  },
  dateGroups: {
    today: '오늘',
    week: '이번 주',
    earlier: '이전'
  },
  home: {
    topBar: '회의록',
    title: '회의를 고르거나 새로 녹음하세요',
    description: '녹음한 회의는 이 컴퓨터 안에서 화자별 회의록으로 정리됩니다.',
    startRecording: '새 녹음 시작하기'
  },
  errors: {
    loadList: '회의 목록을 불러오지 못했습니다',
    search: '회의록을 검색하지 못했습니다'
  }
}

export const sidebarEn: typeof sidebarKo = {
  nav: {
    searchResults: 'Search results',
    meetingList: 'Meetings'
  },
  settings: 'Settings',
  newRecording: {
    recording: 'Recording',
    label: 'New recording'
  },
  listItem: {
    recording: 'Recording',
    defaultError: 'Could not create the transcript'
  },
  search: {
    placeholder: 'Search transcripts',
    clear: 'Clear search',
    searching: 'Searching',
    noResults: ({ query }) => `No meetings contain “${query}”`
  },
  list: {
    empty: 'No meetings recorded yet. Start with a new recording'
  },
  dateGroups: {
    today: 'Today',
    week: 'This week',
    earlier: 'Earlier'
  },
  home: {
    topBar: 'Transcripts',
    title: 'Pick a meeting or start a new recording',
    description: 'Recorded meetings are turned into speaker-labeled transcripts on this computer.',
    startRecording: 'Start a new recording'
  },
  errors: {
    loadList: 'Could not load the meeting list',
    search: 'Could not search transcripts'
  }
}
