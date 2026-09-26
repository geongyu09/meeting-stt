import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { systemAudioTapBinPath } from '../bin/paths'
import { t } from '../locale'
import { info, warn } from '../log'
import { EMPTY_SAMPLE_FIFO, pushSamples, takeSamples } from './systemAudioMix'

/**
 * 동봉 도구 `systemAudioTap`을 띄워 스피커 출력을 16kHz mono Float32 스트림으로 받는다
 * (references/architecture.md "시스템 오디오 캡처"). 규약: stdout = PCM, stderr = `ready` / `error: …` 한 줄씩.
 */

/** 켜기(프로브)에서 `ready`를 기다리는 시간. 첫 실행은 시스템 권한 창이 떠 있는 동안 멈춰 있을 수 있다 */
export const PROBE_TIMEOUT_MS = 15_000
/** stdin을 닫은 뒤 스스로 끝나기를 기다리는 시간. 넘기면 죽인다 */
const STOP_TIMEOUT_MS = 2_000
/** Core Audio Taps API가 생긴 버전 */
const MIN_MACOS = { major: 14, minor: 2 }
const BYTES_PER_SAMPLE = 4
const STDERR_TAIL_CHARS = 300
const READY_LINE = 'ready'
const ERROR_PREFIX = 'error:'

export interface SystemAudioCapture {
  /** 도구가 `ready`를 보내면 resolve. 그 전에 죽으면 reject */
  ready: Promise<void>
  /** 마이크 청크와 같은 개수를 꺼낸다. 아직 안 왔으면 0으로 채운다 */
  take: (count: number) => Float32Array
  /** 정지 직전에 남은 샘플(최대 maxCount, 0 채움 없음) */
  drain: (maxCount: number) => Float32Array
  stop: () => Promise<void>
}

interface StartSystemAudioCaptureParams {
  /** `ready` 이후에 도구가 죽었을 때. 녹음은 마이크만으로 계속되므로 안내만 한다 */
  onFailure: (message: string) => void
}

const isSupportedMacos = () => {
  if (process.platform !== 'darwin') return false
  const [major = 0, minor = 0] = process.getSystemVersion().split('.').map(Number)

  return major > MIN_MACOS.major || (major === MIN_MACOS.major && minor >= MIN_MACOS.minor)
}

/** OS 버전·바이너리 유무를 확인한다. 한국어 안내를 던지므로 그대로 사용자에게 보여줄 수 있다 */
const assertAvailable = () => {
  if (!isSupportedMacos()) {
    throw new Error(
      t().main.recording.systemAudioUnsupported({ version: process.getSystemVersion() })
    )
  }
  if (!existsSync(systemAudioTapBinPath())) {
    warn(`systemAudioTap이 없습니다: ${systemAudioTapBinPath()}`)
    throw new Error(t().main.recording.systemAudioToolMissing)
  }
}

/** stdout 청크는 4바이트 경계에서 잘릴 수 있어 남은 바이트를 다음 청크 앞에 붙인다 */
const createPcmDecoder = () => {
  // subarray가 돌려주는 Buffer의 ArrayBuffer 종류가 달라 Uint8Array로 둔다
  let pending: Uint8Array = new Uint8Array(0)

  return (chunk: Buffer) => {
    const joined = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk
    const usable = joined.length - (joined.length % BYTES_PER_SAMPLE)
    pending = joined.subarray(usable)
    if (usable === 0) return new Float32Array(0)

    // Buffer는 풀의 일부라 정렬을 보장하지 않는다. 복사해 새 ArrayBuffer로 만든다
    return new Float32Array(joined.buffer.slice(joined.byteOffset, joined.byteOffset + usable))
  }
}

const createLineSplitter = (onLine: (line: string) => void) => {
  let tail = ''

  return (chunk: Buffer) => {
    tail += chunk.toString()
    const lines = tail.split('\n')
    tail = lines.pop() ?? ''
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach(onLine)
  }
}

export const startSystemAudioCapture = ({
  onFailure
}: StartSystemAudioCaptureParams): SystemAudioCapture => {
  assertAvailable()

  const child = spawn(systemAudioTapBinPath(), [], { stdio: ['pipe', 'pipe', 'pipe'] })
  const decode = createPcmDecoder()
  let fifo = EMPTY_SAMPLE_FIFO
  let stderrTail = ''
  let isReady = false
  let isStopping = false
  let isEnded = false

  const ready = new Promise<void>((resolve, reject) => {
    const failWith = (message: string) => {
      if (!isReady) reject(new Error(message))
      else if (!isStopping) onFailure(message)
    }

    child.stderr.on(
      'data',
      createLineSplitter((line) => {
        stderrTail = (stderrTail + line + '\n').slice(-STDERR_TAIL_CHARS)
        if (line === READY_LINE) {
          isReady = true
          resolve()
          return
        }
        if (line.startsWith(ERROR_PREFIX)) {
          failWith(
            t().main.recording.systemAudioFailed({ detail: line.slice(ERROR_PREFIX.length).trim() })
          )
          return
        }
        info(`systemAudioTap: ${line}`)
      })
    )

    child.on('error', () => {
      isEnded = true
      failWith(t().main.pipeline.spawnFailed({ command: 'systemAudioTap' }))
    })

    child.on('close', (code) => {
      isEnded = true
      if (isStopping) return
      failWith(
        isReady
          ? t().main.recording.systemAudioStopped
          : t().main.recording.systemAudioFailed({ detail: stderrTail.trim() || String(code) })
      )
    })
  })
  // 세션은 이 약속을 기다리지 않고 녹음을 이어 간다. 여기서 한 번 잡아 두지 않으면 unhandled rejection이 난다
  ready.catch(() => undefined)

  // 도구가 먼저 죽으면 stdin 쓰기에서 EPIPE가 난다. 종료 처리는 close 핸들러가 한다
  child.stdin.on('error', () => undefined)
  child.stdout.on('data', (chunk: Buffer) => {
    fifo = pushSamples({ fifo, samples: decode(chunk) })
  })

  const take = (count: number) => {
    const result = takeSamples({ fifo, count })
    fifo = result.fifo

    return result.samples
  }

  const drain = (maxCount: number) => take(Math.min(fifo.length, maxCount))

  const stop = () =>
    new Promise<void>((resolve) => {
      isStopping = true
      if (isEnded) {
        resolve()
        return
      }

      const timer = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT_MS)
      child.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      child.stdin.end()
    })

  return { ready, take, drain, stop }
}

/**
 * 켜는 순간 도구를 한 번 돌려 본다 — 회의 시작 전에 시스템 권한 창을 띄우고 OS 버전·바이너리 문제를 그 자리에서 알린다.
 * 실패하면 한국어 안내를 던진다.
 */
export const probeSystemAudio = async () => {
  const capture = startSystemAudioCapture({ onFailure: () => undefined })

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(t().main.recording.systemAudioTimeout)),
        PROBE_TIMEOUT_MS
      )
      capture.ready.then(resolve, reject).finally(() => clearTimeout(timer))
    })
  } finally {
    await capture.stop()
  }
}
