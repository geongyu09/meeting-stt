import { useState } from 'react'
import type { LlmProvider } from '@shared/types'
import { checkLlmApi, setClaudeApiKeyApi, setLlmProviderApi } from '@renderer/shared/api/llm'
import useLlmStatus from '@renderer/shared/hooks/domain/llm/useLlmStatus'

const PROVIDER_ERROR_MESSAGE = 'LLM 공급자를 저장하지 못했습니다'
const KEY_ERROR_MESSAGE = 'API 키를 저장하지 못했습니다'
const CHECK_ERROR_MESSAGE = '연결을 확인하지 못했습니다'

const messageOf = ({ caught, fallback }: { caught: unknown; fallback: string }) =>
  caught instanceof Error && caught.message ? caught.message : fallback

/**
 * 설정의 "언어 모델" 카테고리 상태. 공급자 저장·키 저장·연결 확인은 각각 즉시 main에 보내고
 * 응답(`LlmStatus`)을 그대로 반영한다 (references/architecture.md "LLM 공급자").
 */
const useLlmSettings = () => {
  const { status, isLoading, error: loadError, applyStatus } = useLlmStatus()
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const runAction = async ({
    action,
    fallback
  }: {
    action: () => Promise<void>
    fallback: string
  }) => {
    setIsSaving(true)
    setActionError(null)
    setNotice(null)

    try {
      await action()
    } catch (caught) {
      setActionError(messageOf({ caught, fallback }))
    } finally {
      setIsSaving(false)
    }
  }

  const selectProvider = (provider: LlmProvider) =>
    runAction({
      action: async () => applyStatus(await setLlmProviderApi({ provider })),
      fallback: PROVIDER_ERROR_MESSAGE
    })

  const saveApiKey = () =>
    runAction({
      action: async () => {
        applyStatus(await setClaudeApiKeyApi({ apiKey: apiKeyInput }))
        setApiKeyInput('')
        setNotice('API 키를 저장했습니다')
      },
      fallback: KEY_ERROR_MESSAGE
    })

  const clearApiKey = () =>
    runAction({
      action: async () => {
        applyStatus(await setClaudeApiKeyApi({ apiKey: null }))
        setNotice('저장된 API 키를 지웠습니다')
      },
      fallback: KEY_ERROR_MESSAGE
    })

  const checkConnection = async () => {
    setIsChecking(true)
    setActionError(null)
    setNotice(null)

    try {
      const { message } = await checkLlmApi()
      setNotice(message)
    } catch (caught) {
      setActionError(messageOf({ caught, fallback: CHECK_ERROR_MESSAGE }))
    } finally {
      setIsChecking(false)
    }
  }

  return {
    status,
    isLoading,
    loadError: loadError?.message ?? null,
    apiKeyInput,
    isSaving,
    isChecking,
    actionError,
    notice,
    setApiKeyInput,
    selectProvider,
    saveApiKey,
    clearApiKey,
    checkConnection
  }
}

export default useLlmSettings
