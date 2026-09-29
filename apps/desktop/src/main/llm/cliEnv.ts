import { existsSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { runBinary } from '../bin/spawn'
import { info, messageOf, warn } from '../log'

/**
 * Claude Code·Codex CLI가 함께 쓰는 실행 환경. Finder에서 띄운 앱의 PATH에는 사용자가 설치한 CLI가 없다
 * (references/pitfalls.md). 잘 알려진 설치 위치를 먼저 보고, 없으면 로그인 셸에 한 번 물어 캐시한다.
 */

const DEFAULT_SHELL = '/bin/zsh'

export interface CliLocation {
  path: string | null
  version: string | null
}

let cachedShellPath: string | null = null

/** 대화형 로그인 셸은 rc 파일의 출력이 섞일 수 있어 마지막 줄만 취한다 */
export const lastLine = (text: string) => text.trim().split('\n').at(-1)?.trim() ?? ''

const askLoginShell = async (script: string) => {
  try {
    const { stdout } = await runBinary({
      command: process.env.SHELL || DEFAULT_SHELL,
      args: ['-ilc', script]
    })

    return lastLine(stdout)
  } catch (caught) {
    warn(`로그인 셸 조회 실패 (${script}): ${messageOf(caught)}`)
    return ''
  }
}

/** npm으로 설치한 CLI는 `node`를 PATH에서 찾으므로 spawn 환경의 PATH를 로그인 셸 값으로 바꿔 준다 */
const shellPath = async () => {
  if (cachedShellPath) return cachedShellPath

  const found = await askLoginShell('printf %s "$PATH"')
  cachedShellPath = found || process.env.PATH || ''

  return cachedShellPath
}

export const spawnEnv = async () => ({ ...process.env, PATH: await shellPath() })

const readVersion = async ({ command, name }: { command: string; name: string }) => {
  try {
    const { stdout } = await runBinary({ command, args: ['--version'], env: await spawnEnv() })

    return lastLine(stdout) || null
  } catch (caught) {
    warn(`${name} --version 실패: ${messageOf(caught)}`)
    return null
  }
}

interface LocateCliParams {
  /** 로그인 셸의 `command -v`에 넘길 명령 이름 */
  name: string
  candidatePaths: string[]
}

/** 후보 경로 → 로그인 셸 순서로 실행 파일을 찾고 버전을 읽는다. 캐시는 부르는 쪽이 한다 */
export const locateCli = async ({
  name,
  candidatePaths
}: LocateCliParams): Promise<CliLocation> => {
  const candidate = candidatePaths.find((file) => existsSync(file))
  const found = candidate ?? (await askLoginShell(`command -v ${name}`))
  if (!found || !existsSync(found)) return { path: null, version: null }

  const version = await readVersion({ command: found, name })
  info(`${name} 실행 파일: ${found} (${version ?? '버전 확인 실패'})`)

  return { path: found, version }
}

/** 프로젝트 폴더에서 돌리면 그곳의 설정(CLAUDE.md·AGENTS.md)이 프롬프트에 섞인다. 빈 폴더를 cwd로 준다 */
export const cliWorkDir = () => path.join(app.getPath('userData'), 'llm')
