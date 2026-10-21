import type { AssistantPermissionMode } from '@shared/types'
import { runBinary } from '../bin/spawn'
import { spawnEnv } from '../llm/cliEnv'

import { buildClaudeAgentArgs, parseClaudeStreamLine } from './claudeStream'
import type { AgentStreamEvent } from './types/agentStream'

interface RunClaudeAgentParams {
  cliPath: string
  /** 작업 폴더. cwd로 줘야 그 폴더의 CLAUDE.md·스킬·훅을 읽고, --resume도 같은 cwd에서만 이어진다 */
  folder: string
  text: string
  sessionId: string | null
  permissionMode: AssistantPermissionMode
  /** 루틴처럼 답할 사람이 없는 실행 */
  isUnattended?: boolean
  signal: AbortSignal
  onEvent: (event: AgentStreamEvent) => void
}

/**
 * 에이전트 한 턴. 질문은 stdin, 출력은 stream-json 줄마다 이벤트로 넘긴다
 * (references/architecture.md "개인 비서 모드" > "에이전트 실행 경로").
 */
export const runClaudeAgent = async ({
  cliPath,
  folder,
  text,
  sessionId,
  permissionMode,
  isUnattended,
  signal,
  onEvent
}: RunClaudeAgentParams) => {
  await runBinary({
    command: cliPath,
    args: buildClaudeAgentArgs({ permissionMode, sessionId, isUnattended }),
    input: text,
    cwd: folder,
    env: await spawnEnv(),
    signal,
    onStdoutLine: (line) => parseClaudeStreamLine(line).forEach(onEvent)
  })
}
