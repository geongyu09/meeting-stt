import { mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildClaudeCliArgs, parseClaudeCliOutput } from '@shared/llm'
import { t } from '../locale'
import { runBinary } from '../bin/spawn'

import { cliWorkDir, locateCli, spawnEnv, type CliLocation } from './cliEnv'

const CANDIDATE_PATHS = [
  path.join(os.homedir(), '.local', 'bin', 'claude'),
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  path.join(os.homedir(), '.claude', 'local', 'claude')
]

let cachedLocation: CliLocation | null = null

/**
 * `claude` 실행 파일을 찾는다. 한 번 찾으면 앱이 살아 있는 동안 캐시하고,
 * 못 찾았으면 다음 조회에서 다시 찾는다 (사용자가 그 사이 설치할 수 있다).
 */
export const locateClaudeCli = async () => {
  if (cachedLocation?.path) return cachedLocation

  cachedLocation = await locateCli({ name: 'claude', candidatePaths: CANDIDATE_PATHS })

  return cachedLocation
}

interface CompleteWithClaudeCliParams {
  cliPath: string
  system: string
  prompt: string
}

/**
 * `claude -p`를 한 턴 돌려 답변만 돌려준다. 프롬프트는 stdin, 결과는 JSON 한 덩어리다
 * (references/architecture.md "Claude Code CLI 호출").
 */
export const completeWithClaudeCli = async ({
  cliPath,
  system,
  prompt
}: CompleteWithClaudeCliParams) => {
  const cwd = cliWorkDir()
  await mkdir(cwd, { recursive: true })

  const { stdout } = await runBinary({
    command: cliPath,
    args: buildClaudeCliArgs({ system }),
    input: prompt,
    cwd,
    env: await spawnEnv()
  })

  return parseClaudeCliOutput(stdout, t().llm.errors)
}
