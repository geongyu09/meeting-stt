/**
 * LLM 공급자 선택의 순수 로직 (references/architecture.md "LLM 공급자").
 * 공급자 유니온·라벨·준비 여부 판정과 Claude Code CLI 인자·출력 파싱을 둔다.
 * spawn·SDK 호출·키 저장은 `src/main/llm/*`이 담당한다.
 */

import type { LlmProvider, LlmStatus } from './types'

export const LLM_PROVIDERS: LlmProvider[] = ['local', 'claude-api', 'claude-cli']

export const DEFAULT_LLM_PROVIDER: LlmProvider = 'local'

/** 설정·요약 캡션에 쓰는 한국어 라벨 */
export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  local: '로컬 모델',
  'claude-api': 'Claude API',
  'claude-cli': 'Claude Code'
}

/** API 호출에 쓰는 모델. CLI는 사용자가 CLI에 설정한 기본 모델을 쓴다 */
export const CLAUDE_API_MODEL_ID = 'claude-opus-5'

/**
 * Claude는 컨텍스트가 커서 회의록을 통째로 넣는다. 40만 자는 약 28만 토큰으로
 * 8시간짜리 회의도 한 번에 들어간다 (references/architecture.md).
 */
export const CLAUDE_CHUNK_BUDGET_CHARS = 400_000

/**
 * 적응형 사고가 켜져 있으면 max_tokens에 사고 토큰도 포함된다. 로컬용 상한(1200)을 그대로 주면
 * 사고만 하다 잘리므로 이 값 아래로는 내리지 않는다.
 */
export const CLAUDE_MIN_MAX_TOKENS = 16_000

/** Anthropic 키는 `sk-ant-…` 100자 안팎이다. 붙여 넣기 실수(회의록 등)를 거른다 */
export const CLAUDE_API_KEY_MAX_CHARS = 512
export const CLAUDE_API_KEY_TAIL_CHARS = 4

/** 설정 화면 "연결 확인"에 쓰는 한 턴짜리 프롬프트 */
export const LLM_CHECK_SYSTEM_PROMPT =
  '당신은 연결 확인에 응답하는 도우미입니다. 요청받은 말만 출력합니다.'
export const LLM_CHECK_PROMPT = '연결 확인입니다. "확인"이라고만 답하세요.'

export const isLlmProvider = (value: unknown): value is LlmProvider =>
  typeof value === 'string' && (LLM_PROVIDERS as string[]).includes(value)

/**
 * @description 현재 공급자로 요약·초안을 만들 준비가 되어 있지 않을 때 보여줄 한국어 안내를 만듭니다.
 * main(잡 시작 전 확인)과 renderer(버튼 막기)가 같은 문구를 쓴다.
 * @param status - `llm:status` 응답
 * @returns 준비되어 있으면 null
 * @example
 * const message = llmMissingMessage(status) // '로컬 요약 모델 파일이 설치되어 있지 않습니다'
 */
export const llmMissingMessage = (status: LlmStatus) => {
  if (status.provider === 'claude-api') {
    return status.hasClaudeApiKey ? null : 'Claude API 키가 저장되어 있지 않습니다'
  }
  if (status.provider === 'claude-cli') {
    return status.claudeCliPath ? null : 'Claude Code(claude 명령)를 찾을 수 없습니다'
  }

  return status.isLocalModelReady ? null : '로컬 요약 모델 파일이 설치되어 있지 않습니다'
}

/**
 * @description 현재 공급자로 LLM을 부를 수 있는지 판정합니다.
 * @param status - `llm:status` 응답
 * @returns 준비 여부
 * @example
 * if (!isLlmReady(status)) disableButton()
 */
export const isLlmReady = (status: LlmStatus) => llmMissingMessage(status) === null

/**
 * @description `claude -p` 인자를 만듭니다. 프롬프트는 argv가 아니라 stdin으로 넘기므로 여기에 없다.
 * `--bare`는 키체인을 읽지 않아 구독 로그인이 풀리므로 쓰지 않는다 (references/pitfalls.md).
 * @param system - 시스템 프롬프트 (수백 자라 argv로 충분하다)
 * @returns spawn에 넘길 인자 배열
 * @example
 * runBinary({ command: claudePath, args: buildClaudeCliArgs({ system }), input: prompt })
 */
export const buildClaudeCliArgs = ({ system }: { system: string }) => [
  '-p',
  '--output-format',
  'json',
  // 도구를 전부 끈다. 요약은 한 턴짜리 텍스트 생성이라 파일·셸 접근이 필요 없다
  '--tools',
  '',
  '--no-session-persistence',
  // 사용자·프로젝트 설정(훅·플러그인)을 섞지 않는다
  '--setting-sources',
  '',
  '--system-prompt',
  system
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** stdout 앞뒤에 로그가 섞여도 첫 `{`부터 마지막 `}`까지를 JSON으로 본다 */
const extractJson = (stdout: string) => {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    return JSON.parse(stdout.slice(start, end + 1)) as unknown
  } catch {
    return null
  }
}

/**
 * @description `claude -p --output-format json`의 stdout에서 답변 본문을 꺼냅니다.
 * 종료 코드가 0이어도 `is_error`가 참이면 실패이므로 한국어 안내와 원문을 함께 던진다.
 * @param stdout - CLI 표준 출력 전체
 * @returns 답변 텍스트
 * @example
 * const answer = parseClaudeCliOutput(stdout)
 */
export const parseClaudeCliOutput = (stdout: string) => {
  const parsed = extractJson(stdout)
  if (!isRecord(parsed) || parsed.type !== 'result') {
    throw new Error('Claude Code 결과를 읽지 못했습니다 (출력 형식이 예상과 다릅니다)')
  }

  const result = typeof parsed.result === 'string' ? parsed.result : ''
  if (parsed.is_error === true) {
    throw new Error(`Claude Code가 요청을 처리하지 못했습니다: ${result || '원인 불명'}`)
  }

  return result
}

/**
 * @description 화면에 보여줄 키 꼬리를 만듭니다. 키 전체는 renderer로 보내지 않는다.
 * @param apiKey - 복호화한 키
 * @returns 마지막 4자
 * @example
 * apiKeyTailOf('sk-ant-api03-…wxyz') // 'wxyz'
 */
export const apiKeyTailOf = (apiKey: string) => apiKey.slice(-CLAUDE_API_KEY_TAIL_CHARS)

/**
 * @description renderer가 보낸 API 키를 검증합니다. 빈 값·너무 긴 값·줄바꿈이 섞인 값은 거절한다.
 * @param payload - `llm:setClaudeApiKey` 요청 payload
 * @returns 앞뒤 공백을 자른 키. `null`이면 삭제 요청
 * @example
 * const apiKey = readClaudeApiKeyPayload(payload)
 */
export const readClaudeApiKeyPayload = (payload: unknown) => {
  if (!isRecord(payload) || !('apiKey' in payload)) {
    throw new Error('잘못된 요청입니다 (API 키 없음)')
  }
  if (payload.apiKey === null) return null
  if (typeof payload.apiKey !== 'string') throw new Error('잘못된 요청입니다 (API 키 형식 오류)')

  const apiKey = payload.apiKey.trim()
  if (!apiKey) throw new Error('API 키를 입력해 주세요')
  if (apiKey.length > CLAUDE_API_KEY_MAX_CHARS || /\s/.test(apiKey)) {
    throw new Error(
      'API 키 형식이 아닙니다. Anthropic 콘솔에서 복사한 키를 그대로 붙여 넣어 주세요'
    )
  }

  return apiKey
}
