/**
 * LLM 공급자 선택의 순수 로직 (references/architecture.md "LLM 공급자").
 * 공급자 유니온·라벨·API 키 회사·GPT 모델 목록·준비 여부 판정과 Claude Code·Codex CLI 인자·출력 파싱을 둔다.
 * spawn·SDK 호출·키 저장은 `src/main/llm/*`이 담당한다.
 */

import { llmKo } from './locales/llm'
import type { CodexModelOption, LlmApiVendor, LlmProvider, LlmStatus, OpenaiModelId } from './types'

/** main이 던지는 오류 문구. 기본은 한국어 사전이고 main은 현재 언어의 `t().llm.errors`를 넘긴다 */
export type LlmErrorMessages = typeof llmKo.errors
export type LlmMissingMessages = Pick<typeof llmKo, 'missing' | 'apiKeyLabels'>

export const LLM_PROVIDERS: LlmProvider[] = [
  'local',
  'claude-api',
  'claude-cli',
  'openai-api',
  'codex-cli'
]

export const DEFAULT_LLM_PROVIDER: LlmProvider = 'local'

/** 설정·요약 캡션에 쓰는 한국어 라벨. 화면은 `useLocale().t.llm.providerLabels`를 쓴다 */
export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = llmKo.providerLabels

export const LLM_API_VENDORS: LlmApiVendor[] = ['anthropic', 'openai']

/** 키 입력란 라벨과 준비 안내에 쓰는 한국어 이름. 화면은 `useLocale().t.llm.apiKeyLabels`를 쓴다 */
export const LLM_API_KEY_LABELS: Record<LlmApiVendor, string> = llmKo.apiKeyLabels

/** API 호출에 쓰는 Claude 모델. CLI는 사용자가 CLI에 설정한 기본 모델을 쓴다 */
export const CLAUDE_API_MODEL_ID = 'claude-opus-5'

/** GPT-6 계열 셋. 요금 차이가 커서 사용자가 고른다 (references/architecture.md "LLM 공급자"). 라벨은 사전 `llm.openaiModels` */
export const OPENAI_MODEL_IDS: OpenaiModelId[] = ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna']

export const DEFAULT_OPENAI_MODEL_ID: OpenaiModelId = 'gpt-6-sol'

/**
 * 외부 API는 컨텍스트가 커서 회의록을 통째로 넣는다. 40만 자는 약 28만 토큰으로
 * 8시간짜리 회의도 한 번에 들어간다 (references/architecture.md).
 */
export const API_CHUNK_BUDGET_CHARS = 400_000

/**
 * Codex CLI의 구독 모델은 컨텍스트가 27만 2천 토큰이고 Codex 기본 지시문이 앞에 붙는다.
 * 20만 자(약 14만 토큰)면 여유가 남는다 (references/architecture.md "LLM 공급자").
 */
export const CODEX_CHUNK_BUDGET_CHARS = 200_000

/** Codex 모델 id 형식. 카탈로그 밖의 값이 argv로 새는 것(붙여 넣기 실수·옵션 주입)을 막는다 */
const CODEX_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
export const CODEX_MODEL_ID_MAX_CHARS = 64

/**
 * Claude의 적응형 사고와 GPT-6의 추론 토큰은 출력 상한에 포함된다. 로컬용 상한(1200)을 그대로 주면
 * 사고만 하다 잘리므로 이 값 아래로는 내리지 않는다.
 */
export const API_MIN_MAX_TOKENS = 16_000

/** Anthropic 키는 `sk-ant-…` 100자 안팎, OpenAI 키는 `sk-proj-…` 200자 안팎이다. 붙여 넣기 실수(회의록 등)를 거른다 */
export const API_KEY_MAX_CHARS = 512
export const API_KEY_TAIL_CHARS = 4

/** 설정 화면 "연결 확인"에 쓰는 한 턴짜리 프롬프트 */
export const LLM_CHECK_SYSTEM_PROMPT =
  '당신은 연결 확인에 응답하는 도우미입니다. 요청받은 말만 출력합니다.'
export const LLM_CHECK_PROMPT = '연결 확인입니다. "확인"이라고만 답하세요.'

export const isLlmProvider = (value: unknown): value is LlmProvider =>
  typeof value === 'string' && (LLM_PROVIDERS as string[]).includes(value)

export const isLlmApiVendor = (value: unknown): value is LlmApiVendor =>
  typeof value === 'string' && (LLM_API_VENDORS as string[]).includes(value)

export const isOpenaiModelId = (value: unknown): value is OpenaiModelId =>
  typeof value === 'string' && (OPENAI_MODEL_IDS as string[]).includes(value)

/** 목록이 등급마다 달라 값이 아니라 형식만 본다 */
export const isCodexModelId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= CODEX_MODEL_ID_MAX_CHARS &&
  CODEX_MODEL_ID_PATTERN.test(value)

/**
 * @description 공급자가 API 키를 쓰는지, 쓴다면 어느 회사 키인지 알려줍니다. 키 저장·상태·화면이 이 대응 하나를 본다.
 * @param provider - LLM 공급자
 * @returns 회사. 키를 쓰지 않는 공급자(로컬·CLI)는 null
 * @example
 * apiVendorOf('openai-api') // 'openai'
 */
export const apiVendorOf = (provider: LlmProvider): LlmApiVendor | null => {
  if (provider === 'claude-api') return 'anthropic'
  if (provider === 'openai-api') return 'openai'

  return null
}

/**
 * @description 현재 공급자로 요약·초안을 만들 준비가 되어 있지 않을 때 보여줄 한국어 안내를 만듭니다.
 * main(잡 시작 전 확인)과 renderer(버튼 막기)가 같은 문구를 쓴다.
 * @param status - `llm:status` 응답
 * @param messages - 문구 사전. 생략하면 한국어. 화면은 `useLocale().t.llm`, main은 `t().llm`을 넘긴다
 * @returns 준비되어 있으면 null
 * @example
 * const message = llmMissingMessage(status) // '로컬 요약 모델 파일이 설치되어 있지 않습니다'
 */
export const llmMissingMessage = (status: LlmStatus, messages: LlmMissingMessages = llmKo) => {
  if (status.provider === 'claude-cli') {
    return status.claudeCliPath ? null : messages.missing.cli
  }
  if (status.provider === 'codex-cli') {
    return status.codexCliPath ? null : messages.missing.codexCli
  }

  const vendor = apiVendorOf(status.provider)
  if (vendor) {
    return status.apiKeys[vendor].isSaved
      ? null
      : messages.missing.apiKey({ label: messages.apiKeyLabels[vendor] })
  }

  return status.isLocalModelReady ? null : messages.missing.localModel
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
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @returns 답변 텍스트
 * @example
 * const answer = parseClaudeCliOutput(stdout)
 */
export const parseClaudeCliOutput = (stdout: string, errors: LlmErrorMessages = llmKo.errors) => {
  const parsed = extractJson(stdout)
  if (!isRecord(parsed) || parsed.type !== 'result') {
    throw new Error(errors.cliOutputUnreadable)
  }

  const result = typeof parsed.result === 'string' ? parsed.result : ''
  if (parsed.is_error === true) {
    throw new Error(errors.cliFailed({ reason: result || errors.unknownReason }))
  }

  return result
}

interface BuildCodexCliArgsParams {
  system: string
  /** null이면 `-m`을 넘기지 않아 CLI 기본 모델을 쓴다 */
  model: string | null
  /** 마지막 답변을 쓸 파일. stdout은 머리말·토큰 수가 섞인 사람용 출력이다 */
  outputFile: string
}

/**
 * @description `codex exec` 인자를 만듭니다. 프롬프트는 stdin(`-`)으로 넘기므로 여기에 없다.
 * 사용자 config(MCP 서버·알림 훅)는 끄고 인증만 쓴다 (references/architecture.md "Codex CLI 호출").
 * @param system - 시스템 프롬프트. `-c` 값은 TOML로 파싱되므로 JSON 문자열(TOML 기본 문자열과 호환)로 넣는다
 * @param model - 모델 id. null이면 CLI 기본 모델
 * @param outputFile - 답변 파일 경로
 * @returns spawn에 넘길 인자 배열
 * @example
 * runBinary({ command: codexPath, args: buildCodexCliArgs({ system, model, outputFile }), input: prompt })
 */
export const buildCodexCliArgs = ({ system, model, outputFile }: BuildCodexCliArgsParams) => [
  'exec',
  '--ephemeral',
  '--skip-git-repo-check',
  '--ignore-user-config',
  '--ignore-rules',
  '--sandbox',
  'read-only',
  '--color',
  'never',
  '-c',
  `developer_instructions=${JSON.stringify(system)}`,
  // 요약은 정형 작업이라 깊은 추론이 필요 없다 (OpenAI API의 reasoning.effort와 같은 값)
  '-c',
  'model_reasoning_effort="low"',
  ...(model ? ['--model', model] : []),
  '--output-last-message',
  outputFile,
  '-'
]

const readCatalogEntry = (entry: unknown) => {
  if (!isRecord(entry) || entry.visibility !== 'list' || !isCodexModelId(entry.slug)) return null

  return {
    id: entry.slug,
    label: typeof entry.display_name === 'string' ? entry.display_name : entry.slug,
    description: typeof entry.description === 'string' ? entry.description : null,
    priority: typeof entry.priority === 'number' ? entry.priority : Number.MAX_SAFE_INTEGER
  }
}

/**
 * @description `codex debug models`의 JSON에서 구독 계정이 고를 수 있는 모델을 꺼냅니다.
 * 숨김(`visibility !== 'list'`) 모델은 빼고 CLI가 정한 `priority` 순으로 둔다. 형식이 다르면 빈 배열.
 * @param stdout - CLI 표준 출력 전체
 * @returns 모델 선택지
 * @example
 * parseCodexModels('{"models":[{"slug":"gpt-6-luna","display_name":"GPT-6-Luna","visibility":"list"}]}')
 * // [{ id: 'gpt-6-luna', label: 'GPT-6-Luna', description: null }]
 */
export const parseCodexModels = (stdout: string): CodexModelOption[] => {
  const parsed = extractJson(stdout)
  if (!isRecord(parsed) || !Array.isArray(parsed.models)) return []

  return parsed.models
    .map(readCatalogEntry)
    .filter((entry) => entry !== null)
    .toSorted((a, b) => a.priority - b.priority)
    .map(({ id, label, description }) => ({ id, label, description }))
}

const CODEX_ERROR_LINE_PREFIX = 'ERROR: '

const errorMessageOfLine = (line: string) => {
  try {
    const parsed = JSON.parse(line.slice(CODEX_ERROR_LINE_PREFIX.length)) as unknown
    if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === 'string') {
      return parsed.error.message
    }
  } catch {
    // JSON이 아닌 ERROR 줄은 문장 그대로 쓴다
  }

  return line.slice(CODEX_ERROR_LINE_PREFIX.length).trim()
}

/**
 * @description `codex exec`가 실패했을 때 stderr에서 사람이 읽을 사유를 꺼냅니다.
 * `ERROR: {json}` 줄의 `error.message`를 먼저 보고, 없으면 마지막 비어 있지 않은 줄을 쓴다.
 * @param stderr - CLI 표준 오류 전체
 * @returns 사유. stderr가 비어 있으면 null
 * @example
 * codexErrorReason('ERROR: {"error":{"message":"The model is not supported"}}') // 'The model is not supported'
 */
export const codexErrorReason = (stderr: string) => {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const errorLine = lines.findLast((line) => line.startsWith(CODEX_ERROR_LINE_PREFIX))
  if (errorLine) return errorMessageOfLine(errorLine)

  return lines.at(-1) ?? null
}

/**
 * @description renderer가 보낸 Codex 모델 요청을 검증합니다. null(CLI 기본 모델) 또는 형식에 맞는 id만 받는다.
 * @param payload - `llm:setCodexModel` 요청 payload
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @returns 모델 id 또는 null
 * @example
 * const model = readCodexModelPayload({ model: 'gpt-6-luna' }) // 'gpt-6-luna'
 */
export const readCodexModelPayload = (
  payload: unknown,
  errors: LlmErrorMessages = llmKo.errors
) => {
  if (!isRecord(payload) || !('model' in payload)) throw new Error(errors.invalidCodexModel)
  if (payload.model === null) return null
  if (!isCodexModelId(payload.model)) throw new Error(errors.invalidCodexModel)

  return payload.model
}

/**
 * @description 화면에 보여줄 키 꼬리를 만듭니다. 키 전체는 renderer로 보내지 않는다.
 * @param apiKey - 복호화한 키
 * @returns 마지막 4자
 * @example
 * apiKeyTailOf('sk-ant-api03-…wxyz') // 'wxyz'
 */
export const apiKeyTailOf = (apiKey: string) => apiKey.slice(-API_KEY_TAIL_CHARS)

/**
 * @description renderer가 보낸 API 키 요청을 검증합니다. 모르는 회사·빈 값·너무 긴 값·줄바꿈이 섞인 값은 거절한다.
 * @param payload - `llm:setApiKey` 요청 payload
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @returns 회사와 앞뒤 공백을 자른 키. `apiKey`가 `null`이면 삭제 요청
 * @example
 * const { vendor, apiKey } = readApiKeyPayload(payload)
 */
export const readApiKeyPayload = (payload: unknown, errors: LlmErrorMessages = llmKo.errors) => {
  if (!isRecord(payload) || !isLlmApiVendor(payload.vendor)) {
    throw new Error(errors.invalidVendor)
  }
  if (!('apiKey' in payload)) throw new Error(errors.missingApiKey)

  const { vendor } = payload
  if (payload.apiKey === null) return { vendor, apiKey: null }
  if (typeof payload.apiKey !== 'string') throw new Error(errors.invalidApiKeyType)

  const apiKey = payload.apiKey.trim()
  if (!apiKey) throw new Error(errors.emptyApiKey)
  if (apiKey.length > API_KEY_MAX_CHARS || /\s/.test(apiKey)) {
    throw new Error(errors.malformedApiKey)
  }

  return { vendor, apiKey }
}
