import { createHashRouter } from 'react-router'
import Home from '@renderer/pages/Home'
import MeetingDetail from '@renderer/pages/MeetingDetail'
import Onboarding from '@renderer/pages/Onboarding'
import Record from '@renderer/pages/Record'
import Settings from '@renderer/pages/Settings'

import { RequireModels } from './guards'
import { PATHS } from './paths'

/** file://에서도 동작해야 하므로 해시 라우터를 쓴다 (references/architecture.md) */
export const router = createHashRouter([
  { path: PATHS.onboarding, element: <Onboarding /> },
  {
    // 경로 없는 레이아웃 라우트. 필수 모델이 없으면 자식 대신 온보딩으로 보낸다
    element: <RequireModels />,
    children: [
      { path: PATHS.home, element: <Home /> },
      { path: PATHS.record, element: <Record /> },
      { path: PATHS.meetingDetail, element: <MeetingDetail /> },
      { path: PATHS.settings, element: <Settings /> }
    ]
  }
])
