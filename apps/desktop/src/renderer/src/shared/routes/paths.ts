/** 라우트 경로의 단일 정의. 컴포넌트는 경로 문자열을 직접 쓰지 않고 여기서 가져온다 */
export const PATHS = {
  /** 첫 화면은 채팅이다. 기록·문서는 옆 패널, 설정은 자식 라우트의 모달이다 (references/features/ui.md "채팅창 리뉴얼") */
  assistant: '/',
  settings: '/settings',
  summaryTemplates: '/summary-templates',
  recordings: '/recordings',
  widget: '/widget'
} as const
