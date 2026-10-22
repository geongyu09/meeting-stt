import type { AssistantPermissionMode } from '@shared/types'

import { CHAT_SYSTEM_PROMPT } from './chatPrompt'
import { shortTarget } from './claudeStream'
import type { AgentStreamEvent } from './types/agentStream'

/**
 * 에이전트용 `codex exec --json` 인자 조립과 이벤트 해석 (references/architecture.md "개인 비서 모드" > "Codex CLI").
 * electron에 의존하지 않는 순수 함수라 실측 출력(fixtures/)으로 vitest 검증한다.
 */

interface BuildCodexAgentArgsParams {
  permissionMode: AssistantPermissionMode
  /** 이어 갈 thread id. 첫 질문이면 null */
  sessionId: string | null
  /** null이면 사용자 config의 기본 모델 */
  model: string | null
  /** 답할 사람이 없는 백그라운드 실행(루틴·정리). 채팅용 시스템 지시를 붙이지 않는다 */
  isUnattended?: boolean
}

/**
 * @description 에이전트 한 턴의 `codex exec` 인자를 만듭니다. 질문은 stdin(`-`)으로 넘긴다.
 * `exec resume`은 `--sandbox`를 받지 않아 샌드박스는 두 경우 모두 `-c sandbox_mode`로 넘긴다 (references/pitfalls.md).
 * @example
 * buildCodexAgentArgs({ permissionMode: 'acceptEdits', sessionId: null, model: null })
 */
export const buildCodexAgentArgs = ({
  permissionMode,
  sessionId,
  model,
  isUnattended = false
}: BuildCodexAgentArgsParams) => [
  'exec',
  ...(sessionId ? ['resume'] : []),
  '--json',
  // git 저장소가 아닌 작업 폴더도 허용한다. 되돌리기 어렵다는 안내는 화면이 한다
  '--skip-git-repo-check',
  ...(permissionMode === 'bypassPermissions'
    ? ['--dangerously-bypass-approvals-and-sandbox']
    : ['-c', 'sandbox_mode="workspace-write"']),
  ...(model ? ['--model', model] : []),
  // 값은 TOML로 읽힌다. JSON 문자열은 TOML 기본 문자열과 호환된다 (features/llm.md)
  ...(isUnattended ? [] : ['-c', `developer_instructions=${JSON.stringify(CHAT_SYSTEM_PROMPT)}`]),
  ...(sessionId ? [sessionId] : []),
  '-'
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

/**
 * Codex는 명령을 `/bin/zsh -lc "…"`로 감싸 보낸다. 사람이 읽을 것은 안쪽 명령이다.
 * 셸 인용을 이어 붙이면 끝 따옴표가 다를 수 있어(`"…"'$?'`) 같은 따옴표로 끝날 때만 끝을 떼어 낸다
 */
const SHELL_PREFIX_PATTERN = /^\S+ -lc (["'])/

const unwrapShell = (command: string) => {
  const match = SHELL_PREFIX_PATTERN.exec(command)
  if (!match) return command

  const inner = command.slice(match[0].length)
  return inner.endsWith(match[1]) ? inner.slice(0, -1) : inner
}

const FILE_CHANGE_NAMES: Record<string, string> = {
  add: 'Add',
  update: 'Update',
  delete: 'Delete'
}

const fileChangeEvents = (item: Record<string, unknown>, id: string): AgentStreamEvent[] => {
  if (!Array.isArray(item.changes)) return []

  return item.changes.filter(isRecord).flatMap((change, index) => {
    if (typeof change.path !== 'string') return []
    const kind = typeof change.kind === 'string' ? change.kind : 'update'

    return [
      {
        kind: 'tool' as const,
        id: `${id}:${index}`,
        name: FILE_CHANGE_NAMES[kind] ?? kind,
        target: change.path,
        // 지운 파일은 에디터로 열 수 없어 바뀐 파일 목록에 넣지 않는다
        filePath: kind === 'delete' ? null : change.path
      }
    ]
  })
}

const startedItemEvents = (item: unknown): AgentStreamEvent[] => {
  if (!isRecord(item) || typeof item.id !== 'string') return []

  if (item.type === 'command_execution' && typeof item.command === 'string') {
    const target = shortTarget(unwrapShell(item.command))
    return [{ kind: 'tool', id: item.id, name: 'Shell', target, filePath: null }]
  }
  if (item.type === 'file_change') return fileChangeEvents(item, item.id)

  return []
}

const completedItemEvents = (item: unknown): AgentStreamEvent[] => {
  if (!isRecord(item) || item.type !== 'agent_message' || typeof item.text !== 'string') return []

  return [{ kind: 'message', text: item.text }]
}

/** `turn.failed`의 message는 API 오류 JSON 문자열인 경우가 많다. 안쪽 문장을 꺼낸다 */
const failureReasonOf = (error: unknown) => {
  if (!isRecord(error) || typeof error.message !== 'string') return ''

  const inner = parseJsonLine(error.message)
  if (isRecord(inner) && isRecord(inner.error) && typeof inner.error.message === 'string') {
    return inner.error.message
  }

  return error.message
}

/**
 * @description `codex exec --json` 한 줄을 앱이 쓰는 이벤트로 바꿉니다. 모르는 줄·JSON이 아닌 줄은 빈 배열이다.
 * @param line - stdout 한 줄
 * @returns 이벤트 목록. 파일 변경 하나에 파일이 여럿일 수 있어 배열이다
 * @example
 * parseCodexStreamLine('{"type":"thread.started","thread_id":"abc"}') // [{ kind: 'session', sessionId: 'abc' }]
 */
export const parseCodexStreamLine = (line: string): AgentStreamEvent[] => {
  const parsed = parseJsonLine(line)
  if (!isRecord(parsed)) return []

  if (parsed.type === 'thread.started' && typeof parsed.thread_id === 'string') {
    return [{ kind: 'session', sessionId: parsed.thread_id }]
  }
  if (parsed.type === 'item.started') return startedItemEvents(parsed.item)
  if (parsed.type === 'item.completed') return completedItemEvents(parsed.item)
  if (parsed.type === 'turn.completed') {
    return [{ kind: 'result', isError: false, text: '', sessionId: null }]
  }
  if (parsed.type === 'turn.failed') {
    return [{ kind: 'result', isError: true, text: failureReasonOf(parsed.error), sessionId: null }]
  }

  return []
}
