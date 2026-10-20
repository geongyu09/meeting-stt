import type { AssistantPermissionMode } from '@shared/types'

import type { AgentStreamEvent } from './types/agentStream'

/**
 * 에이전트용 `claude -p` 인자 조립과 stream-json 출력 해석 (references/architecture.md "개인 비서 모드").
 * 요약 경로(`src/shared/llm.ts`)와 달리 설정 소스·도구를 끄지 않는다 — 작업 폴더의 CLAUDE.md·스킬·훅을 읽는 것이 목적이다.
 * electron에 의존하지 않는 순수 함수라 실측 출력(fixtures/)으로 vitest 검증한다.
 */

/** `acceptEdits`가 허용하지 않는 명령 중 읽기 전용 git만 미리 허용한다. 더 넓히려면 작업 폴더의 settings에 적는다 */
export const AGENT_ALLOWED_TOOLS = ['Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)']

/** `-p`에는 선택 창이 없어 이 도구가 불리면 질문이 사라진다 (references/pitfalls.md "개인 비서 모드") */
const AGENT_DISALLOWED_TOOLS = ['AskUserQuestion']

const NO_DIALOG_PROMPT =
  '이 대화는 데스크탑 앱의 채팅 창에서 이어집니다. 선택 창을 띄울 수 없으니, 사용자에게 물을 것이 있으면 ' +
  '답변 글에 번호 목록으로 질문을 쓰고 사용자의 다음 메시지를 기다리세요.'

/** 파일을 쓰거나 고치는 도구. 이 도구의 대상 파일이 "바뀐 파일" 목록이 된다 */
const EDIT_TOOL_NAMES = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']

/** 도구 한 줄 표시에 쓸 입력 필드. 앞에 있는 것이 우선이다 */
const TOOL_TARGET_KEYS = [
  'file_path',
  'notebook_path',
  'command',
  'pattern',
  'url',
  'query',
  'path'
]

/** 명령이 여러 줄이거나 길면 화면 한 줄을 넘는다 */
const TOOL_TARGET_MAX_CHARS = 160

interface BuildClaudeAgentArgsParams {
  permissionMode: AssistantPermissionMode
  /** 이어 갈 대화. 첫 질문이면 null */
  sessionId: string | null
}

/**
 * @description 에이전트 한 턴의 `claude -p` 인자를 만듭니다. 질문은 stdin으로 넘기므로 여기에 없다.
 * @example
 * runBinary({ command, args: buildClaudeAgentArgs({ permissionMode, sessionId }), input: text, cwd: folder })
 */
export const buildClaudeAgentArgs = ({ permissionMode, sessionId }: BuildClaudeAgentArgsParams) => [
  '-p',
  '--output-format',
  'stream-json',
  // stream-json은 --verbose 없이 거절된다
  '--verbose',
  '--include-partial-messages',
  '--permission-mode',
  permissionMode,
  '--allowedTools',
  ...AGENT_ALLOWED_TOOLS,
  '--disallowedTools',
  ...AGENT_DISALLOWED_TOOLS,
  '--append-system-prompt',
  NO_DIALOG_PROMPT,
  ...(sessionId ? ['--resume', sessionId] : [])
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseJsonLine = (line: string) => {
  try {
    return JSON.parse(line) as unknown
  } catch {
    return null
  }
}

/** 도구 대상 한 줄. Codex 해석(codexStream.ts)도 같은 규칙으로 줄인다 */
export const shortTarget = (value: string) => {
  const firstLine = value.trim().split('\n')[0] ?? ''

  return firstLine.length > TOOL_TARGET_MAX_CHARS
    ? `${firstLine.slice(0, TOOL_TARGET_MAX_CHARS)}…`
    : firstLine
}

const toolEventOf = (block: Record<string, unknown>): AgentStreamEvent | null => {
  if (block.type !== 'tool_use' || typeof block.name !== 'string' || typeof block.id !== 'string') {
    return null
  }

  const input = isRecord(block.input) ? block.input : {}
  const targetKey = TOOL_TARGET_KEYS.find((key) => typeof input[key] === 'string' && input[key])
  const target = targetKey ? shortTarget(input[targetKey] as string) : null
  const editedPath = input.file_path ?? input.notebook_path
  const filePath =
    EDIT_TOOL_NAMES.includes(block.name) && typeof editedPath === 'string' ? editedPath : null

  return { kind: 'tool', id: block.id, name: block.name, target, filePath }
}

/** 답변 글은 조각(text_delta)으로 받으므로 완성된 assistant 메시지에서는 도구만 꺼낸다 */
const toolEventsOf = (message: unknown) => {
  if (!isRecord(message) || !Array.isArray(message.content)) return []

  return message.content
    .filter(isRecord)
    .map(toolEventOf)
    .filter((event) => event !== null)
}

const textDeltaOf = (event: unknown): AgentStreamEvent[] => {
  if (!isRecord(event) || event.type !== 'content_block_delta' || !isRecord(event.delta)) return []
  if (event.delta.type !== 'text_delta' || typeof event.delta.text !== 'string') return []

  return [{ kind: 'text', text: event.delta.text }]
}

/** 오류 결과는 `result` 대신 `errors` 배열에 사유를 담기도 한다 (잘못된 세션 id 등) */
const resultTextOf = (parsed: Record<string, unknown>) => {
  if (typeof parsed.result === 'string' && parsed.result) return parsed.result
  if (Array.isArray(parsed.errors)) {
    return parsed.errors.filter((reason) => typeof reason === 'string').join('\n')
  }

  return ''
}

/**
 * @description stream-json 한 줄을 앱이 쓰는 이벤트로 바꿉니다. 모르는 줄·JSON이 아닌 줄은 빈 배열이다 —
 * CLI가 줄 종류를 계속 늘리므로 아는 것만 골라 쓴다 (references/pitfalls.md "개인 비서 모드").
 * @param line - stdout 한 줄
 * @returns 이벤트 목록. assistant 메시지 하나에 도구가 여럿일 수 있어 배열이다
 * @example
 * parseClaudeStreamLine('{"type":"system","subtype":"init","session_id":"abc"}')
 * // [{ kind: 'session', sessionId: 'abc' }]
 */
export const parseClaudeStreamLine = (line: string): AgentStreamEvent[] => {
  const parsed = parseJsonLine(line)
  if (!isRecord(parsed)) return []

  if (parsed.type === 'system' && parsed.subtype === 'init') {
    return typeof parsed.session_id === 'string'
      ? [{ kind: 'session', sessionId: parsed.session_id }]
      : []
  }
  if (parsed.type === 'stream_event') return textDeltaOf(parsed.event)
  if (parsed.type === 'assistant') return toolEventsOf(parsed.message)
  if (parsed.type === 'result') {
    return [
      {
        kind: 'result',
        isError: parsed.is_error === true,
        text: resultTextOf(parsed),
        sessionId: typeof parsed.session_id === 'string' ? parsed.session_id : null
      }
    ]
  }

  return []
}
