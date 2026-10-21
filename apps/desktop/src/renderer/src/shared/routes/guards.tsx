import { Navigate, Outlet } from 'react-router'
import useModelStatus from '@renderer/shared/hooks/domain/model/useModelStatus'

import { PATHS } from './paths'

/**
 * 녹음 화면만 막는다 — 필수 모델이 없으면 채팅(`/`)으로 보내고, 거기의 설정 카드가 모델을 받게 한다
 * (references/features/ui.md "채팅창 리뉴얼" > "처음 실행"). 모델은 선택이라 그 밖의 화면은 막지 않는다.
 * 마운트될 때 한 번만 조회한다. 상태 조회 자체가 실패하면 막지 않는다. 파이프라인이 모델 부재를 한국어로 다시 알린다.
 */
export function RequireModels() {
  const { status, isLoading } = useModelStatus()

  if (isLoading && !status) return null
  if (status && !status.isReady) return <Navigate to={PATHS.assistant} replace />

  return <Outlet />
}
