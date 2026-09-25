import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioInputDevice } from '@shared/types'
import { rmsOf } from '@shared/audio'
import { requestMicrophonePermissionApi } from '@renderer/shared/api/recording'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { openMicrophone } from '@renderer/shared/utils/microphone'

const LEVEL_POLL_MS = 100
/** 이 아래는 무음으로 본다. 말소리 RMS는 0.1~0.3, 조용한 방의 바닥 잡음은 0.001 안팎이다 */
const SILENCE_LEVEL = 0.01
const SILENCE_WARN_MS = 3000
/** 녹음 화면의 파형과 같은 칸 수. 100ms 간격이라 약 5초 분량이다 */
const LEVEL_HISTORY_SIZE = 48
const ANALYSER_FFT_SIZE = 2048

export type MicrophoneTestStatus = 'idle' | 'listening' | 'silent'

interface TestGraph {
  context: AudioContext
  stream: MediaStream
  timer: ReturnType<typeof setInterval>
}

interface UseMicrophoneTestParams {
  inputDevice: AudioInputDevice | null
}

const messageOf = ({ caught, fallback }: { caught: unknown; fallback: string }) =>
  caught instanceof Error ? caught.message : fallback

const closeGraph = async ({ context, stream, timer }: TestGraph) => {
  clearInterval(timer)
  stream.getTracks().forEach((track) => track.stop())
  await context.close()
}

/**
 * 녹음하지 않고 소리가 들어오는지 본다. 녹음 그래프와 같은 제약·같은 16kHz 확인을 거치므로
 * 녹음이 실패할 환경이면 테스트도 같은 안내로 실패한다 (references/architecture.md "마이크 입력 장치와 테스트").
 */
const useMicrophoneTest = ({ inputDevice }: UseMicrophoneTestParams) => {
  const { t } = useLocale()
  const [isRunning, setIsRunning] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [levels, setLevels] = useState<number[]>([])
  const [status, setStatus] = useState<MicrophoneTestStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const graphRef = useRef<TestGraph | null>(null)

  // effect에서도 부르므로 setState는 프로미스 콜백 안에서만 한다 (.claude/rules/hook-guide.md)
  const stop = useCallback(() => {
    const graph = graphRef.current
    if (!graph) return Promise.resolve()

    graphRef.current = null

    return closeGraph(graph).then(() => {
      setIsRunning(false)
      setStatus('idle')
      setLevels([])
    })
  }, [])

  const start = useCallback(async () => {
    if (graphRef.current || isStarting) return

    setIsStarting(true)
    setError(null)

    try {
      if (!(await requestMicrophonePermissionApi())) {
        throw new Error(t.recording.errors.permissionDenied)
      }

      const { stream, context } = await openMicrophone({ inputDevice, t })
      const analyser = context.createAnalyser()
      analyser.fftSize = ANALYSER_FFT_SIZE
      // destination까지 이어야 그래프가 돈다. 게인 0은 마이크 소리가 스피커로 되돌아가지 않게 한다
      const silentSink = context.createGain()
      silentSink.gain.value = 0
      context.createMediaStreamSource(stream).connect(analyser)
      analyser.connect(silentSink).connect(context.destination)

      const samples = new Float32Array(analyser.fftSize)
      let lastLoudAt = Date.now()
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        const level = rmsOf(samples)
        const now = Date.now()
        if (level >= SILENCE_LEVEL) lastLoudAt = now

        setLevels((current) => [...current, level].slice(-LEVEL_HISTORY_SIZE))
        setStatus(now - lastLoudAt >= SILENCE_WARN_MS ? 'silent' : 'listening')
      }, LEVEL_POLL_MS)

      graphRef.current = { context, stream, timer }
      setIsRunning(true)
      setStatus('listening')
    } catch (caught) {
      setError(messageOf({ caught, fallback: t.recording.errors.microphoneOpenFailed }))
    } finally {
      setIsStarting(false)
    }
  }, [inputDevice, isStarting, t])

  // 장치를 바꾸면 이전 장치를 듣고 있는 테스트는 의미가 없다
  useEffect(() => {
    void stop()
  }, [inputDevice?.deviceId, stop])

  useEffect(
    () => () => {
      void stop()
    },
    [stop]
  )

  return { isRunning, isStarting, levels, status, error, start, stop }
}

export default useMicrophoneTest
