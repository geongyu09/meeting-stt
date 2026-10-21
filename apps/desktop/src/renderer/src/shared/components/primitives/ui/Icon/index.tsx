import type { ReactNode } from 'react'

export type IconName =
  | 'mic'
  | 'search'
  | 'settings'
  | 'copy'
  | 'markdown'
  | 'more'
  | 'close'
  | 'check'
  | 'chevronDown'
  | 'play'
  | 'pause'
  | 'download'
  | 'chat'
  | 'arrowUp'
  | 'stop'
  | 'file'
  | 'folder'
  | 'pencil'
  | 'read'
  | 'upload'
  | 'bolt'
  | 'plus'
  | 'minus'

interface IconProps {
  name: IconName
  size?: number
}

const DEFAULT_SIZE = 16

/** 24×24 격자의 stroke 아이콘. 색은 글자색(currentColor)을 따른다 */
const PATHS: Record<IconName, ReactNode> = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  markdown: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 15V9l3 3 3-3v6" />
      <path d="M17 9v6" />
      <path d="m15 13 2 2 2-2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12 5 5 9-10" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  play: <path d="M8 5v14l11-7z" fill="currentColor" />,
  // 막대 사이 틈이 공통 stroke에 메워지면 정지(■)처럼 보여 테두리 없이 칠만 한다
  pause: (
    <g fill="currentColor" stroke="none">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </g>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />,
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  // 터미널 프롬프트 모양. 에이전트가 읽거나 실행한 도구 줄에 쓴다
  read: <path d="M4 17l6-6-6-6M12 19h8" />,
  upload: <path d="M12 20V8M6 14l6-6 6 6M5 4h14" />,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />
}

/** 장식용이다. 아이콘만 있는 버튼은 버튼 쪽에 aria-label을 붙인다 */
export default function Icon({ name, size = DEFAULT_SIZE }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
