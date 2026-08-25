import { createHashRouter } from 'react-router'
import Home from '@renderer/pages/Home'
import MeetingDetail from '@renderer/pages/MeetingDetail'
import Record from '@renderer/pages/Record'

import { PATHS } from './paths'

/** file://에서도 동작해야 하므로 해시 라우터를 쓴다 (references/architecture.md) */
export const router = createHashRouter([
  { path: PATHS.home, element: <Home /> },
  { path: PATHS.record, element: <Record /> },
  { path: PATHS.meetingDetail, element: <MeetingDetail /> }
])
