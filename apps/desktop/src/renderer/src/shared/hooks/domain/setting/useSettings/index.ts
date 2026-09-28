import { useCallback, useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { getSettingsApi, updateSettingsApi } from '@renderer/shared/api/settings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

const useSettings = () => {
  const { t } = useLocale()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // effect에서 부르는 함수라 await 대신 프로미스 체인으로 쓴다 (.claude/rules/hook-guide.md)
  const fetchSettings = useCallback(
    () =>
      getSettingsApi()
        .then((next) => {
          setSettings(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(t.settings.loadError))
        )
        .finally(() => setIsLoading(false)),
    [t]
  )

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  /**
   * 설정은 전체를 한 번에 저장한다. 바뀐 항목만 넘기면 나머지는 현재 값을 유지한다.
   * 이 훅을 쓰는 화면이 여럿이라(설정 섹션, LLM 섹션의 자동 교정 스위치) 저장 직전에 main의 최신 값을 읽어 합친다 —
   * 자기 상태로 합치면 다른 인스턴스가 저장한 값을 오래된 값으로 덮어쓴다
   */
  const updateSettings = async (changes: Partial<AppSettings>) => {
    if (!settings) return

    try {
      const latest = await getSettingsApi()
      setSettings(await updateSettingsApi({ ...latest, ...changes }))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(t.settings.saveError))
    }
  }

  return { settings, isLoading, error, updateSettings }
}

export default useSettings
