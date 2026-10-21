import { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import Welcome from '@renderer/pages/Welcome'
import { getAssistantFolderApi } from '@renderer/shared/api/assistant'
import useAssistantStatus from '@renderer/shared/hooks/domain/assistant/useAssistantStatus'

/**
 * 작업 폴더를 한 번도 고르지 않았으면 메인 창의 어떤 화면도 열지 않고 첫 화면만 그린다 (references/features/ui.md "첫 화면").
 * 이동이 아니라 자리 바꿈이라 폴더를 고르면 같은 URL에서 바로 채팅이 선다.
 */
export function RequireFolder() {
  const { status, isLoading } = useAssistantStatus()
  // 전체 상태는 CLI 탐색 때문에 첫 호출이 느리다. 경로만 먼저 읽어 창이 비지 않게 한다
  const [folder, setFolder] = useState<string | null>()

  useEffect(() => {
    getAssistantFolderApi()
      .then((next) => setFolder(next.folder))
      // 전체 상태 조회가 같은 실패를 겪고 채팅이 그 오류를 알린다
      .catch(() => setFolder(undefined))
  }, [])

  // 폴더 고르기 응답은 applyStatus로 전체 상태에 들어오므로 전체 상태가 있으면 그쪽이 최신이다
  const known = status ? status.folder : folder
  if (known === undefined && isLoading) return null
  if (known === null) return <Welcome />

  return <Outlet />
}
