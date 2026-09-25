import { useCallback, useEffect, useState } from 'react'
import type { GlossarySettings } from '@shared/types'
import { getGlossaryApi } from '@renderer/shared/api/glossary'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

/** 전역 용어 사전 읽기 전용 조회. 편집·저장은 설정 화면(`setting/GlossarySection`)이 맡는다 */
const useGlossary = () => {
  const { t } = useLocale()
  const [glossary, setGlossary] = useState<GlossarySettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // effect에서 부르는 함수라 await 대신 프로미스 체인으로 쓴다 (.claude/rules/hook-guide.md)
  const fetchGlossary = useCallback(
    () =>
      getGlossaryApi()
        .then((next) => {
          setGlossary(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(t.glossary.actions.loadError))
        )
        .finally(() => setIsLoading(false)),
    [t]
  )

  useEffect(() => {
    fetchGlossary()
  }, [fetchGlossary])

  return { glossary, isLoading, error }
}

export default useGlossary
