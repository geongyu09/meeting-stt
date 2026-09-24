import type { LlmProvider } from '@shared/types'
import { LLM_PROVIDER_LABELS } from '@shared/llm'

interface ProviderOptionItem {
  value: LlmProvider
  title: string
  /** 어디서 돌고, 회의록이 어디로 가며, 무엇이 필요한지. 전송 사실은 빼지 않는다 (SKILL.md 1절) */
  description: string
}

export const PROVIDER_OPTIONS: ProviderOptionItem[] = [
  {
    value: 'local',
    title: `${LLM_PROVIDER_LABELS.local} (기본)`,
    description:
      '이 기기에서 llama.cpp로 실행합니다. 회의 내용이 기기 밖으로 나가지 않습니다. 아래 로컬 요약 모델 파일(약 2.5GB)을 받아야 합니다.'
  },
  {
    value: 'claude-api',
    title: `${LLM_PROVIDER_LABELS['claude-api']} 키`,
    description:
      'Anthropic 콘솔에서 발급한 API 키로 Claude를 호출합니다. 회의록이 Anthropic 서버로 전송되고 토큰 요금이 부과됩니다.'
  },
  {
    value: 'claude-cli',
    title: `${LLM_PROVIDER_LABELS['claude-cli']} (구독)`,
    description:
      '이 컴퓨터에 설치된 Claude Code(claude 명령)를 실행해 로그인한 구독 계정으로 호출합니다. 회의록이 Anthropic 서버로 전송되며 구독 사용량에 포함됩니다.'
  }
]
