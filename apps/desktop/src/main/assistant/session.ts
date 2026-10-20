import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import type { AssistantChatState, AssistantProvider, AssistantTurn } from '@shared/types'
import { getAssistantPermissionMode, getCodexModel } from '../db/settings'
import { locateClaudeCli } from '../llm/claudeCli'
import { locateCodexCli } from '../llm/codexCli'
import { t } from '../locale'
import { info, messageOf, warn } from '../log'

import { runClaudeAgent } from './claudeAgent'
import { runCodexAgent } from './codexAgent'
import type { AgentStreamEvent } from './types/agentStream'
import { requireWorkspaceFolder } from './folder'
import { toWorkspaceRelative } from './workspacePath'

/**
 * 진행 중 대화의 단일 출처 (references/architecture.md "개인 비서 모드" > "대화 상태").
 * DB에 저장하지 않는다 — 앱 종료·새 대화·작업 폴더 변경으로 사라지고, 이어 가기는 CLI 세션 id로 한다.
 */

/** 글 조각마다 대화 전체를 보내면 긴 대화에서 IPC가 커진다. 이 간격으로 모아 보낸다 */
const STATE_PUSH_INTERVAL_MS = 50

const EMPTY_STATE: AssistantChatState = {
  provider: null,
  sessionId: null,
  turns: [],
  isRunning: false
}

let state = EMPTY_STATE
let controller: AbortController | null = null
let stateListener: ((state: AssistantChatState) => void) | null = null
let pushTimer: NodeJS.Timeout | null = null

export const setAssistantStateListener = (listener: (state: AssistantChatState) => void) => {
  stateListener = listener
}

export const getAssistantChatState = () => state

export const isAssistantRunning = () => state.isRunning

const pushState = () => {
  pushTimer = null
  stateListener?.(state)
}

const setState = (next: AssistantChatState) => {
  state = next
  pushTimer ??= setTimeout(pushState, STATE_PUSH_INTERVAL_MS)
}

const updateAnswer = (change: (turn: AssistantTurn) => AssistantTurn) => {
  const answer = state.turns.at(-1)
  if (!answer || answer.role !== 'assistant') return

  setState({ ...state, turns: state.turns.with(-1, change(answer)) })
}

const turnOf = ({ role, text }: Pick<AssistantTurn, 'role' | 'text'>): AssistantTurn => ({
  id: randomUUID(),
  role,
  text,
  tools: [],
  changedFiles: [],
  error: null
})

/** roots: 작업 폴더 경로와 그 실제 경로. 도구 대상·바뀐 파일을 폴더 기준 상대 경로로 보여 줄 때 쓴다 */
const handleStreamEvent = ({ roots, event }: { roots: string[]; event: AgentStreamEvent }) => {
  if (event.kind === 'session') {
    setState({ ...state, sessionId: event.sessionId })
    return
  }
  if (event.kind === 'text') {
    updateAnswer((turn) => ({ ...turn, text: turn.text + event.text }))
    return
  }
  if (event.kind === 'message') {
    updateAnswer((turn) => ({
      ...turn,
      text: turn.text ? `${turn.text}\n\n${event.text}` : event.text
    }))
    return
  }
  if (event.kind === 'tool') {
    const changed = event.filePath ? toWorkspaceRelative({ roots, filePath: event.filePath }) : null
    updateAnswer((turn) => ({
      ...turn,
      tools: [
        ...turn.tools,
        {
          id: event.id,
          name: event.name,
          target: event.target ? toWorkspaceRelative({ roots, filePath: event.target }) : null
        }
      ],
      changedFiles:
        changed && !turn.changedFiles.includes(changed)
          ? [...turn.changedFiles, changed]
          : turn.changedFiles
    }))
    return
  }

  if (event.sessionId) setState({ ...state, sessionId: event.sessionId })
  // 글 조각을 못 받은 경우(조각 없이 끝난 턴)에도 최종 글은 남긴다
  updateAnswer((turn) => ({
    ...turn,
    text: event.isError || turn.text ? turn.text : event.text,
    error: event.isError
      ? t().assistant.errors.agentFailed({
          reason: event.text || t().assistant.errors.unknownReason
        })
      : turn.error
  }))
}

interface RunTurnParams {
  provider: AssistantProvider
  cliPath: string
  folder: string
  text: string
  signal: AbortSignal
}

const runTurn = async ({ provider, cliPath, folder, text, signal }: RunTurnParams) => {
  const roots = [folder, await realpath(folder).catch(() => folder)]
  const turn = {
    cliPath,
    folder,
    text,
    sessionId: state.sessionId,
    permissionMode: getAssistantPermissionMode(),
    signal,
    onEvent: (event: AgentStreamEvent) => handleStreamEvent({ roots, event })
  }

  // Codex 모델은 설정 "요약 · 용어 초안"에서 고른 것을 그대로 쓴다 (references/data-model.md `assistant.*`)
  if (provider === 'codex-cli') await runCodexAgent({ ...turn, model: getCodexModel() })
  else await runClaudeAgent(turn)
}

const locateAgentCli = (provider: AssistantProvider) =>
  provider === 'codex-cli' ? locateCodexCli() : locateClaudeCli()

/** 결과 줄이 남긴 사유가 비정상 종료의 stderr 꼬리보다 읽기 쉽다. 없을 때만 예외 문장을 쓴다 */
const finishTurn = (caught: unknown, signal: AbortSignal) => {
  if (caught !== null) {
    const message = signal.aborted ? t().assistant.errors.cancelled : messageOf(caught)
    if (!signal.aborted) warn(`에이전트 턴 실패: ${message}`)
    updateAnswer((turn) => ({ ...turn, error: turn.error ?? message }))
  }

  controller = null
  setState({ ...state, isRunning: false })
}

/**
 * 질문 하나를 보내고 턴이 시작되면 바로 돌아온다. 진행은 상태 push로 알린다.
 * 폴더 문제·실행 중·공급자 불일치는 시작 전에 거절한다.
 */
export const sendAssistantMessage = async ({
  provider,
  text
}: {
  provider: AssistantProvider
  text: string
}) => {
  const errors = t().assistant.errors
  const assertIdle = () => {
    if (state.isRunning) throw new Error(errors.busy)
    if (state.provider && state.provider !== provider) throw new Error(errors.providerMismatch)
  }
  assertIdle()

  const folder = await requireWorkspaceFolder()
  const cli = await locateAgentCli(provider)
  if (!cli.path) throw new Error(errors.cliMissing({ label: t().assistant.providers[provider] }))
  // 위의 확인을 기다리는 사이 다른 질문이 먼저 시작했을 수 있다
  assertIdle()

  const nextController = new AbortController()
  controller = nextController
  setState({
    ...state,
    provider,
    turns: [
      ...state.turns,
      turnOf({ role: 'user', text }),
      turnOf({ role: 'assistant', text: '' })
    ],
    isRunning: true
  })
  info(`에이전트 턴 시작 (${provider}, 이어 가기: ${state.sessionId ? '예' : '아니오'})`)

  void runTurn({ provider, cliPath: cli.path, folder, text, signal: nextController.signal })
    .then(() => finishTurn(null, nextController.signal))
    .catch((caught: unknown) => finishTurn(caught, nextController.signal))
}

/** 실행 중인 에이전트 프로세스를 끝낸다. 받은 글은 남고 세션 id도 남아 다음 질문이 이어진다 */
export const cancelAssistant = () => {
  controller?.abort()
}

export const resetAssistantChat = () => {
  if (state.isRunning) throw new Error(t().assistant.errors.busy)

  setState(EMPTY_STATE)
  return state
}
