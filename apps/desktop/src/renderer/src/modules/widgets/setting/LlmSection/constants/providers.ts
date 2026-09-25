import type { LlmProvider } from '@shared/types'
import { LLM_PROVIDERS } from '@shared/llm'

/** 라디오에 나열하는 순서. 제목·설명은 사전 `llm.providers`에 있다 */
export const PROVIDER_ORDER: LlmProvider[] = LLM_PROVIDERS
