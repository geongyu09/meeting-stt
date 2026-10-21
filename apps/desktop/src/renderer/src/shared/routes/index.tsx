import { createHashRouter } from 'react-router'
import Assistant from '@renderer/pages/Assistant'
import Settings from '@renderer/pages/Settings'
import SummaryTemplates from '@renderer/pages/SummaryTemplates'
import Widget from '@renderer/pages/Widget'

import { MainWindowLayout } from './layout'
import { PATHS } from './paths'

/** file://에서도 동작해야 하므로 해시 라우터를 쓴다 (references/architecture.md) */
export const router = createHashRouter([
  { path: PATHS.widget, element: <Widget /> },
  {
    element: <MainWindowLayout />,
    children: [
      // 채팅은 창 하나이고 모델 없이도 열린다 — 처음 실행 설정 카드가 그 안에 있고, 녹음·기록·문서도 그 안의 카드·옆 패널이다
      // (references/features/ui.md "채팅창 리뉴얼")
      {
        path: PATHS.assistant,
        element: <Assistant />,
        // 설정은 채팅 위에 뜨는 모달이라 채팅의 자식 라우트다 (references/features/ui.md "설정 모달")
        children: [{ path: PATHS.settings, element: <Settings /> }]
      },
      // 설정에서 들어오는 전체 창 편집 화면. 돌아가기 버튼이 설정 모달을 다시 연다
      { path: PATHS.summaryTemplates, element: <SummaryTemplates /> }
    ]
  }
])
