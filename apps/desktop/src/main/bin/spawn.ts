import { spawn } from 'node:child_process'

/** 실패 안내에 붙일 stderr 꼬리 길이 */
const STDERR_TAIL_CHARS = 800

interface RunBinaryParams {
  command: string
  args: string[]
  /** stdin으로 넘길 본문. 넘기면 쓰고 바로 닫는다 (claude -p처럼 argv에 못 넣는 긴 프롬프트용) */
  input?: string
  /** 작업 폴더. 프로젝트 폴더의 설정 파일을 읽어 가는 CLI는 빈 폴더에서 돌린다 */
  cwd?: string
  /** GUI 앱의 PATH는 로그인 셸과 다르다. 필요하면 바꿔 넘긴다 (references/pitfalls.md) */
  env?: NodeJS.ProcessEnv
  /** 진행률 파싱용. 라인 단위로 잘라 넘긴다 */
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
}

interface LineSplitter {
  push: (text: string) => void
}

const createLineSplitter = (onLine?: (line: string) => void): LineSplitter => {
  let tail = ''

  return {
    push: (text: string) => {
      if (!onLine) return
      tail += text
      const lines = tail.split('\n')
      tail = lines.pop() ?? ''
      lines.forEach(onLine)
    }
  }
}

/**
 * 외부 바이너리 실행. 동기 spawn은 UI를 멈추므로 쓰지 않는다 (references/pitfalls.md).
 * 종료 코드가 0이 아니면 stderr 꼬리를 담은 한국어 에러를 던진다.
 */
export const runBinary = ({
  command,
  args,
  input,
  cwd,
  env,
  onStdoutLine,
  onStderrLine
}: RunBinaryParams) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, cwd, env })
    const stdoutSplitter = createLineSplitter(onStdoutLine)
    const stderrSplitter = createLineSplitter(onStderrLine)
    let stdout = ''
    let stderr = ''

    if (input !== undefined) {
      // 읽는 쪽이 먼저 죽으면 EPIPE가 난다. 종료 처리는 close 핸들러가 하므로 여기서는 무시한다
      child.stdin.on('error', () => {})
      child.stdin.end(input)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      stdoutSplitter.push(text)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      stderrSplitter.push(text)
    })

    child.on('error', () => {
      reject(new Error(`${command} 실행에 실패했습니다. 파일이 있는지 확인해 주세요`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(
        new Error(
          `${command} 이(가) 비정상 종료했습니다 (코드 ${code})\n${stderr.slice(-STDERR_TAIL_CHARS)}`
        )
      )
    })
  })
