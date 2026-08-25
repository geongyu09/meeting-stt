import { spawn } from 'node:child_process'

/** 실패 안내에 붙일 stderr 꼬리 길이 */
const STDERR_TAIL_CHARS = 800

interface RunBinaryParams {
  command: string
  args: string[]
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
export const runBinary = ({ command, args, onStdoutLine, onStderrLine }: RunBinaryParams) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    const stdoutSplitter = createLineSplitter(onStdoutLine)
    const stderrSplitter = createLineSplitter(onStderrLine)
    let stdout = ''
    let stderr = ''

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
