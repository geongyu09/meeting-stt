import { describe, expect, it } from 'vitest'

import { runBinary } from './spawn'

const SHELL = '/bin/sh'

/** 프로세스가 아직 살아 있는지. 신호 0은 보내지 않고 존재만 확인한다 */
const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const runAndAbort = async ({ script, abortAfterMs }: { script: string; abortAfterMs: number }) => {
  const controller = new AbortController()
  let pid = 0
  const running = runBinary({
    command: SHELL,
    args: ['-c', `echo $$; ${script}`],
    signal: controller.signal,
    onStdoutLine: (line) => {
      pid = Number(line)
    }
  })
  setTimeout(() => controller.abort(), abortAfterMs)
  const startedAt = Date.now()
  await expect(running).rejects.toThrow()

  return { pid, elapsedMs: Date.now() - startedAt }
}

describe('runBinary 취소', () => {
  it('abort하면 프로세스가 실제로 끝난 뒤에 reject한다', async () => {
    const { pid } = await runAndAbort({ script: 'exec sleep 10', abortAfterMs: 100 })

    expect(pid).toBeGreaterThan(0)
    expect(isAlive(pid)).toBe(false)
  })

  it('SIGTERM을 무시하는 프로세스는 유예 시간 뒤 SIGKILL로 끝낸다', async () => {
    const { pid, elapsedMs } = await runAndAbort({
      script: "trap '' TERM; while true; do sleep 0.1; done",
      abortAfterMs: 100
    })

    expect(isAlive(pid)).toBe(false)
    expect(elapsedMs).toBeGreaterThanOrEqual(3000)
  }, 10_000)
})
