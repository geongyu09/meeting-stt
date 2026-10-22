import type { AssistantPermissionMode } from '@shared/types'
import { codexErrorReason } from '@shared/llm'
import { runBinary } from '../bin/spawn'
import { spawnEnv } from '../llm/cliEnv'
import { messageOf } from '../log'

import { buildCodexAgentArgs, parseCodexStreamLine } from './codexStream'
import type { AgentStreamEvent } from './types/agentStream'

interface RunCodexAgentParams {
  cliPath: string
  /** 작업 폴더. cwd로 줘야 그 폴더의 AGENTS.md를 읽고 workspace-write 샌드박스가 이 폴더에 쓰기를 허용한다 */
  folder: string
  text: string
  sessionId: string | null
  permissionMode: AssistantPermissionMode
  model: string | null
  /** 루틴처럼 답할 사람이 없는 실행 */
  isUnattended?: boolean
  signal: AbortSignal
  onEvent: (event: AgentStreamEvent) => void
}

/**
 * Codex 에이전트 한 턴. 질문은 stdin, 출력은 `--json` 줄마다 이벤트로 넘긴다
 * (references/architecture.md "개인 비서 모드" > "Codex CLI"). 잘못된 thread id 같은 시작 실패는 JSON 없이
 * stderr에만 남아 그 마지막 줄을 사유로 쓴다.
 */
export const runCodexAgent = async ({
  cliPath,
  folder,
  text,
  sessionId,
  permissionMode,
  model,
  isUnattended,
  signal,
  onEvent
}: RunCodexAgentParams) => {
  const stderrLines: string[] = []

  await runBinary({
    command: cliPath,
    args: buildCodexAgentArgs({ permissionMode, sessionId, model, isUnattended }),
    input: text,
    cwd: folder,
    env: await spawnEnv(),
    signal,
    onStdoutLine: (line) => parseCodexStreamLine(line).forEach(onEvent),
    onStderrLine: (line) => stderrLines.push(line)
  }).catch((caught: unknown) => {
    if (signal.aborted) throw caught
    throw new Error(codexErrorReason(stderrLines.join('\n')) ?? messageOf(caught))
  })
}
