/**
 * 옛 사이드바에서 남은 문구 — 회의 목록·검색 훅과 날짜 묶음 유틸이 쓴다. 사이드바 자체는 2026-10-22 채팅창 리뉴얼로 없앴다
 * (references/features/recording.md "옛 페이지 제거"). ko가 타입을 정하고 en은 같은 키를 가져야 한다
 */
export const sidebarKo = {
  dateGroups: {
    today: '오늘',
    week: '이번 주',
    earlier: '이전'
  },
  errors: {
    loadList: '회의 목록을 불러오지 못했습니다',
    search: '회의록을 검색하지 못했습니다'
  }
}

export const sidebarEn: typeof sidebarKo = {
  dateGroups: {
    today: 'Today',
    week: 'This week',
    earlier: 'Earlier'
  },
  errors: {
    loadList: 'Could not load the meeting list',
    search: 'Could not search transcripts'
  }
}
