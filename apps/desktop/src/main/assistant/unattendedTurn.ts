import { realpath } from 'node:fs/promises'
import { getAssistantPermissionMode, getCodexModel } from '../db/settings'
import { locateClaudeCli } from '../llm/claudeCli'
import { locateCodexCli } from '../llm/codexCli'
import { t } from '../locale'
import { messageOf } from '../log'

import { runClaudeAgent } from './claudeAgent'
import { runCodexAgent } from './codexAgent'
import { resolveProvider } from './folder'
import type { AgentStreamEvent } from './types/agentStream'
import { toWorkspaceRelative } from './workspacePath'

/**
 * 답할 사람이 없는 백그라운드 한 턴 — 루틴과 녹음 기록 정리가 같이 쓴다
 * (references/features/assistant.md "루틴" > "스케줄러와 실행", "녹음 기록 자동 정리" > "정리 에이전트").
 * 채팅 대화(`session.ts`)를 거치지 않고 새 세션으로 돌며, 글과 바꾼 파일만 모은다.
 */

export interface UnattendedTurnResult {
  text: string
  /** 작업 폴더 기준 상대 경로 */
  changedFiles: string[]
  /** 한국어 사유. 성공이면 null */
  error: string | null
}

interface RunUnattendedTurnParams {
  folder: string
  text: string
  controller: AbortController
  timeoutMs: number
  timeoutMessage: string
  extraAllowedTools?: string[]
}

interface RunAgentParams extends Pick<
  RunUnattendedTurnParams,
  'folder' | 'text' | 'extraAllowedTools'
> {
  signal: AbortSignal
  onEvent: (event: AgentStreamEvent) => void
}

/** 채팅과 같은 에이전트(설정에서 고른 것, 없으면 설치된 첫 CLI)로 새 세션 한 턴을 돈다 */
const runAgent = async ({ folder, text, signal, extraAllowedTools, onEvent }: RunAgentParams) => {
  const turn = {
    folder,
    text,
    sessionId: null,
    permissionMode: getAssistantPermissionMode(),
    signal,
    onEvent
  }

  const provider = await resolveProvider()
  const cli = provider === 'codex-cli' ? await locateCodexCli() : await locateClaudeCli()
  if (!cli.path) {
    throw new Error(t().assistant.errors.cliMissing({ label: t().assistant.providers[provider] }))
  }

  if (provider === 'codex-cli') {
    return runCodexAgent({
      ...turn,
      cliPath: cli.path,
      model: getCodexModel(),
      isUnattended: true
    })
  }
  return runClaudeAgent({ ...turn, cliPath: cli.path, isUnattended: true, extraAllowedTools })
}

/**
 * 한 턴의 결과. 시간 제한을 넘기면 중지하고 `error`에 사유를 담는다.
 * 호출자가 `controller.abort()`로 끝냈으면(지우기·앱 종료) 결과를 남기지 않도록 그대로 throw한다.
 */
export const runUnattendedTurn = async ({
  folder,
  text,
  controller,
  timeoutMs,
  timeoutMessage,
  extraAllowedTools
}: RunUnattendedTurnParams): Promise<UnattendedTurnResult> => {
  let answer = ''
  let changedFiles: string[] = []
  let resultError: string | null = null
  let isTimedOut = false
  const timer = setTimeout(() => {
    isTimedOut = true
    controller.abort()
  }, timeoutMs)

  const handleEvent = ({ roots, event }: { roots: string[]; event: AgentStreamEvent }) => {
    if (event.kind === 'text') answer += event.text
    if (event.kind === 'message') answer = answer ? `${answer}\n\n${event.text}` : event.text
    if (event.kind === 'tool' && event.filePath) {
      const changed = toWorkspaceRelative({ roots, filePath: event.filePath })
      if (!changedFiles.includes(changed)) changedFiles = [...changedFiles, changed]
    }
    if (event.kind !== 'result') return
    // 글 조각 없이 끝난 턴도 최종 글은 남긴다
    if (event.isError) resultError = event.text || t().assistant.errors.unknownReason
    else if (!answer) answer = event.text
  }

  try {
    // 폴더 경로에 심볼릭 링크가 끼면 CLI가 실제 경로를 쓸 수 있다
    const roots = [folder, await realpath(folder).catch(() => folder)]
    await runAgent({
      folder,
      text,
      signal: controller.signal,
      extraAllowedTools,
      onEvent: (event) => handleEvent({ roots, event })
    })

    return { text: answer, changedFiles, error: resultError }
  } catch (caught) {
    if (controller.signal.aborted && !isTimedOut) throw caught

    return {
      text: answer,
      changedFiles,
      error: isTimedOut ? timeoutMessage : (resultError ?? messageOf(caught))
    }
  } finally {
    clearTimeout(timer)
  }
}
