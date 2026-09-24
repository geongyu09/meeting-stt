import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import UpdateBanner from '@renderer/modules/features/update/UpdateBanner'
import MeetingSidebarSection from '@renderer/modules/widgets/meeting/MeetingSidebarSection'
import { onRecordingState } from '@renderer/shared/api/events'

import { meetingDetailPath } from './paths'
import styles from './layout.module.css'

/**
 * 메인 창의 공통 레이아웃. 녹음이 어디서 정지됐든(위젯·메뉴바·단축키) 결과 화면으로 데려간다 —
 * 녹음을 끝낸 직후에 보고 싶은 것은 회의록이다 (references/architecture.md).
 * 위젯 창은 이 레이아웃 밖에 있어 스스로 이동하지 않는다.
 */
export function MainWindowLayout() {
  const navigate = useNavigate()

  useEffect(
    () =>
      onRecordingState(({ stoppedMeetingId }) => {
        if (stoppedMeetingId) navigate(meetingDetailPath({ meetingId: stoppedMeetingId }))
      }),
    [navigate]
  )

  return <Outlet />
}

/**
 * 사이드바 + 본문 두 칸 (references/architecture.md "메인 창과 사이드바 레이아웃").
 * 업데이트 알림은 어느 화면에서든 보이도록 본문 위에 둔다.
 */
export function AppShellLayout() {
  return (
    <div className={styles.shell}>
      <MeetingSidebarSection />
      <main className={styles.main}>
        <UpdateBanner />
        <Outlet />
      </main>
    </div>
  )
}
