import { useCallback, useEffect, useRef, useState } from 'react'
import { CHANNELS, CHUNK_SAMPLES, SAMPLE_RATE_HZ } from '@shared/audio'
import type { Meeting } from '@shared/types'
import workletUrl from '@renderer/worklet/pcmRecorder.js?url'
import {
  requestMicrophonePermissionApi,
  sendRecordingChunkApi,
  startRecordingApi,
  stopRecordingApi
} from '@renderer/shared/api/recording'

const PROCESSOR_NAME = 'pcmRecorder'
const ELAPSED_TICK_MS = 200
const MS_PER_SEC = 1000
const PERMISSION_DENIED_MESSAGE =
  '마이크 사용 권한이 없습니다. 시스템 설정에서 마이크 접근을 허용해 주세요'

interface RecordingGraph {
  context: AudioContext
  stream: MediaStream
  node: AudioWorkletNode
}

const messageOf = (caught: unknown) =>
  caught instanceof Error ? caught.message : '녹음 중 알 수 없는 오류가 발생했습니다'

const rmsOf = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)

/**
 * 마이크 → 워크릿 → 무음 싱크 그래프를 만든다.
 * destination까지 이어 두지 않으면 워크릿의 process()가 호출되지 않고,
 * 게인을 0으로 두지 않으면 마이크 소리가 스피커로 되돌아간다 (references/pitfalls.md).
 */
const buildGraph = async (): Promise<RecordingGraph> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: CHANNELS, echoCancellation: true, noiseSuppression: true }
  })
  const context = new AudioContext({ sampleRate: SAMPLE_RATE_HZ })

  try {
    if (context.sampleRate !== SAMPLE_RATE_HZ) {
      throw new Error(
        `이 마이크는 ${SAMPLE_RATE_HZ}Hz 녹음을 지원하지 않습니다 (현재 ${context.sampleRate}Hz)`
      )
    }

    await context.audioWorklet.addModule(workletUrl)
    const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      processorOptions: { chunkSamples: CHUNK_SAMPLES }
    })
    const silentSink = context.createGain()
    silentSink.gain.value = 0

    context.createMediaStreamSource(stream).connect(node)
    node.connect(silentSink).connect(context.destination)

    return { context, stream, node }
  } catch (caught) {
    stream.getTracks().forEach((track) => track.stop())
    await context.close()
    throw caught
  }
}

const useRecorder = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [level, setLevel] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const graphRef = useRef<RecordingGraph | null>(null)
  const meetingIdRef = useRef<string | null>(null)

  /** 오디오 그래프를 먼저 끊어야 정지 요청 뒤에 청크가 더 날아가지 않는다 */
  const teardownGraph = useCallback(async () => {
    const graph = graphRef.current
    graphRef.current = null
    if (!graph) return

    graph.node.port.onmessage = null
    graph.node.disconnect()
    graph.stream.getTracks().forEach((track) => track.stop())
    await graph.context.close()
  }, [])

  const finalize = useCallback(async () => {
    await teardownGraph()
    const meetingId = meetingIdRef.current
    meetingIdRef.current = null

    return meetingId ? stopRecordingApi({ meetingId }) : null
  }, [teardownGraph])

  const start = useCallback(async () => {
    setError(null)
    setIsBusy(true)

    try {
      if (!(await requestMicrophonePermissionApi())) throw new Error(PERMISSION_DENIED_MESSAGE)

      const graph = await buildGraph()
      const meetingId = await startRecordingApi({ sampleRate: graph.context.sampleRate })

      graph.node.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
        setLevel(rmsOf(new Float32Array(data)))
        sendRecordingChunkApi({ meetingId, pcm: data }).catch((caught) =>
          setError(messageOf(caught))
        )
      }

      graphRef.current = graph
      meetingIdRef.current = meetingId
      setElapsedSec(0)
      setLevel(0)
      setIsRecording(true)
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setIsBusy(false)
    }
  }, [])

  /** 정지된 회의를 반환한다. 호출한 쪽이 상세 화면으로 이동할 수 있도록 */
  const stop = useCallback(async (): Promise<Meeting | null> => {
    setIsBusy(true)

    try {
      return await finalize()
    } catch (caught) {
      setError(messageOf(caught))

      return null
    } finally {
      setIsRecording(false)
      setLevel(0)
      setIsBusy(false)
    }
  }, [finalize])

  useEffect(() => {
    if (!isRecording) return

    const startedAt = Date.now()
    const timer = setInterval(
      () => setElapsedSec((Date.now() - startedAt) / MS_PER_SEC),
      ELAPSED_TICK_MS
    )

    return () => clearInterval(timer)
  }, [isRecording])

  // 녹음 중에 화면을 벗어나도 WAV 헤더는 확정돼야 파이프라인이 돌아간다
  useEffect(
    () => () => {
      finalize().catch((caught) => console.error('녹음 정리 실패', messageOf(caught)))
    },
    [finalize]
  )

  return { isRecording, isBusy, level, elapsedSec, error, start, stop }
}

export default useRecorder
