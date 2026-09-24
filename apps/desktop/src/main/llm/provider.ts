import type { LlmStatus } from '@shared/types'
import { CLAUDE_CHUNK_BUDGET_CHARS, llmMissingMessage } from '@shared/llm'
import { getLlmProvider } from '../db/settings'

import { claudeApiKeyTail, readClaudeApiKey } from './apiKey'
import { completeWithClaudeApi } from './claudeApi'
import { completeWithClaudeCli, locateClaudeCli } from './claudeCli'
import { createLocalClient, isLocalLlmReady } from './local'
import type { LlmClient } from './types'

/** 설정 화면과 잡 시작 전 확인이 함께 쓰는 현재 상태 (references/architecture.md "LLM 공급자") */
export const getLlmStatus = async (): Promise<LlmStatus> => {
  const cli = await locateClaudeCli()

  return {
    provider: getLlmProvider(),
    isLocalModelReady: isLocalLlmReady(),
    hasClaudeApiKey: readClaudeApiKey() !== null,
    claudeApiKeyTail: claudeApiKeyTail(),
    claudeCliPath: cli.path,
    claudeCliVersion: cli.version
  }
}

const createClaudeApiClient = ({ apiKey }: { apiKey: string }): LlmClient => ({
  provider: 'claude-api',
  chunkBudgetChars: CLAUDE_CHUNK_BUDGET_CHARS,
  complete: ({ system, prompt, maxTokens }) =>
    completeWithClaudeApi({ apiKey, system, prompt, maxTokens })
})

const createClaudeCliClient = ({ cliPath }: { cliPath: string }): LlmClient => ({
  provider: 'claude-cli',
  chunkBudgetChars: CLAUDE_CHUNK_BUDGET_CHARS,
  complete: ({ system, prompt }) => completeWithClaudeCli({ cliPath, system, prompt })
})

/**
 * 설정을 한 번 읽어 공급자 클라이언트를 만든다. 잡이 시작할 때 부르므로 진행 중인 잡의 공급자는 바뀌지 않는다.
 * 준비되지 않았으면 spawn·요청 전에 한국어 메시지로 멈춘다.
 */
export const createLlmClient = async (): Promise<LlmClient> => {
  const status = await getLlmStatus()
  const missing = llmMissingMessage(status)
  if (missing) throw new Error(missing)

  if (status.provider === 'claude-api') {
    return createClaudeApiClient({ apiKey: readClaudeApiKey() as string })
  }
  if (status.provider === 'claude-cli') {
    return createClaudeCliClient({ cliPath: status.claudeCliPath as string })
  }

  return createLocalClient()
}
