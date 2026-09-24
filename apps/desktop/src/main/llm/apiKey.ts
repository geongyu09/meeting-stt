import { safeStorage } from 'electron'
import { apiKeyTailOf } from '@shared/llm'
import { getEncryptedClaudeApiKey, setEncryptedClaudeApiKey } from '../db/settings'
import { messageOf, warn } from '../log'

/**
 * Claude API 키는 `safeStorage`로 암호화해 settings 테이블에 base64로 둔다 (references/data-model.md).
 * 평문은 요청 직전 이 모듈 안에서만 잠깐 존재하고, renderer로는 유무와 꼬리만 나간다.
 */
const ensureEncryptionAvailable = () => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('이 환경에서는 키를 안전하게 저장할 수 없습니다 (키체인 접근 불가)')
  }
}

export const saveClaudeApiKey = ({ apiKey }: { apiKey: string }) => {
  ensureEncryptionAvailable()
  setEncryptedClaudeApiKey({ encrypted: safeStorage.encryptString(apiKey).toString('base64') })
}

export const clearClaudeApiKey = () => setEncryptedClaudeApiKey({ encrypted: null })

/** 복호화에 실패하면(다른 사용자 계정·키체인 초기화) 없는 것으로 본다. 앱이 멈추면 안 된다 */
export const readClaudeApiKey = () => {
  const encrypted = getEncryptedClaudeApiKey()
  if (!encrypted) return null

  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch (caught) {
    warn(`Claude API 키 복호화 실패: ${messageOf(caught)}`)
    return null
  }
}

export const claudeApiKeyTail = () => {
  const apiKey = readClaudeApiKey()

  return apiKey ? apiKeyTailOf(apiKey) : null
}
