import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { CodexModelOption } from '@shared/types'
import { buildCodexCliArgs, codexErrorReason, parseCodexModels } from '@shared/llm'
import { t } from '../locale'
import { runBinary } from '../bin/spawn'
import { messageOf, warn } from '../log'

import { cliWorkDir, locateCli, spawnEnv, type CliLocation } from './cliEnv'

/** ChatGPT 데스크탑 앱도 codex를 동봉한다. 터미널에 따로 설치하지 않은 사용자도 쓸 수 있게 후보에 넣는다 */
const CANDIDATE_PATHS = [
  path.join(os.homedir(), '.local', 'bin', 'codex'),
  '/opt/homebrew/bin/codex',
  '/usr/local/bin/codex',
  '/Applications/ChatGPT.app/Contents/Resources/codex',
  '/Applications/Codex.app/Contents/Resources/codex'
]

const OUTPUT_FILE_NAME = 'answer.txt'

let cachedLocation: CliLocation | null = null

/** `codex` 실행 파일을 찾는다. 캐시 규칙은 Claude Code와 같다 (못 찾았으면 다음 조회에서 다시 찾는다) */
export const locateCodexCli = async () => {
  if (cachedLocation?.path) return cachedLocation

  cachedLocation = await locateCli({ name: 'codex', candidatePaths: CANDIDATE_PATHS })

  return cachedLocation
}

/**
 * 로그인한 구독 계정으로 고를 수 있는 모델. 등급마다 달라 앱에 고정하지 않고 CLI 카탈로그를 읽는다.
 * 실패하면 빈 목록(= CLI 기본 모델만)으로 둔다 (references/architecture.md "Codex CLI 호출").
 */
export const listCodexModels = async ({
  cliPath
}: {
  cliPath: string
}): Promise<CodexModelOption[]> => {
  try {
    const { stdout } = await runBinary({
      command: cliPath,
      args: ['debug', 'models'],
      cwd: os.tmpdir(),
      env: await spawnEnv()
    })

    return parseCodexModels(stdout)
  } catch (caught) {
    warn(`codex debug models 실패: ${messageOf(caught)}`)
    return []
  }
}

interface CompleteWithCodexCliParams {
  cliPath: string
  model: string | null
  system: string
  prompt: string
}

/**
 * `codex exec`를 한 턴 돌려 답변만 돌려준다. 프롬프트는 stdin, 답은 `-o` 파일로 받는다
 * (references/architecture.md "Codex CLI 호출"). 실패 사유는 stderr의 `ERROR: {json}` 줄에서 꺼낸다.
 */
export const completeWithCodexCli = async ({
  cliPath,
  model,
  system,
  prompt
}: CompleteWithCodexCliParams) => {
  const cwd = cliWorkDir()
  await mkdir(cwd, { recursive: true })
  // 답변 파일을 cwd에 두지 않는다. cwd는 CLI가 작업 폴더로 보는 빈 폴더로 남긴다
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'meeting-stt-codex-'))
  const outputFile = path.join(outputDir, OUTPUT_FILE_NAME)
  const stderrLines: string[] = []
  const errors = t().llm.errors

  try {
    await runBinary({
      command: cliPath,
      args: buildCodexCliArgs({ system, model, outputFile }),
      input: prompt,
      cwd,
      env: await spawnEnv(),
      onStderrLine: (line) => stderrLines.push(line)
    }).catch((caught: unknown) => {
      const reason = codexErrorReason(stderrLines.join('\n')) ?? messageOf(caught)
      throw new Error(errors.codexFailed({ reason }))
    })

    const answer = await readFile(outputFile, 'utf8').catch(() => '')
    if (!answer.trim()) throw new Error(errors.codexEmptyAnswer)

    return answer
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
}
