import { useEffect, useState } from 'react'
import type { AssistantSkill } from '@shared/types'
import { listAssistantSkillsApi } from '@renderer/shared/api/assistant'

interface UseWorkspaceSkillsParams {
  /** 작업 폴더. 없으면 읽지 않는다 */
  folder: string | null
}

/**
 * `/` 명령 메뉴의 스킬 목록. 폴더마다 한 번 읽는다 — 폴더 감시는 점 폴더를 거르므로 스킬 변경은 알지 못한다
 * (references/features/ui.md "채팅창 리뉴얼" > "IPC").
 */
const useWorkspaceSkills = ({ folder }: UseWorkspaceSkillsParams) => {
  const [skills, setSkills] = useState<AssistantSkill[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    if (!folder) return

    listAssistantSkillsApi()
      .then((next) => {
        setSkills(next)
        setError(null)
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught : new Error('skills')))
      .finally(() => setIsLoaded(true))
  }, [folder])

  return { skills, error, isLoaded }
}

export default useWorkspaceSkills
