import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioInputDevice } from '@shared/types'
import { onRecordingCommand } from '@renderer/shared/api/events'
import {
  discardRecordingApi,
  reportRecordingErrorApi,
  requestMicrophonePermissionApi,
  sendRecordingChunkApi,
  startRecordingApi,
  stopRecordingApi
} from '@renderer/shared/api/recording'
import { getSettingsApi } from '@renderer/shared/api/settings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import {
  closeMicrophoneGraph,
  openMicrophoneGraph,
  type MicrophoneGraph
} from '@renderer/shared/utils/microphoneGraph'

interface UseRecorderParams {
  /** 모델이 준비됐는지. 준비 전에는 시작 요청을 막고 안내한다 */
  isReady: boolean
}

const messageOf = ({ caught, fallback }: { caught: unknown; fallback: string }) =>
  caught instanceof Error ? caught.message : fallback

/** 설정을 못 읽어도 녹음은 막지 않는다 — 시스템 기본 마이크로 진행한다 */
const readInputDevice = (): Promise<AudioInputDevice | null> =>
  getSettingsApi()
    .then((settings) => settings.inputDevice)
    .catch((caught: unknown) => {
      console.error('입력 장치 설정을 읽지 못해 기본 마이크로 녹음합니다', caught)

      return null
    })

/**
 * 오디오 그래프의 유일한 소유자인 위젯 창 전용 훅. 상태(녹음 중 여부·경과 시간·레벨)는
 * main 세션이 들고 있으므로 여기서는 그래프와 실패만 다룬다 (references/architecture.md).
 */
const useRecorder = ({ isReady }: UseRecorderParams) => {
  const { t } = useLocale()
  const [isBusy, setIsBusy] = useState(false)
  const graphRef = useRef<MicrophoneGraph | null>(null)
  const meetingIdRef = useRef<string | null>(null)

  /** 실패는 세션에 모아 두 창이 같은 안내를 본다 */
  const report = useCallback(
    (caught: unknown) => {
      const message = messageOf({ caught, fallback: t.recording.errors.unknown })
      reportRecordingErrorApi({ message }).catch(() =>
        console.error(`녹음 오류를 알리지 못했습니다: ${message}`)
      )
    },
    [t]
  )

  /** 오디오 그래프를 먼저 끊어야 정지 요청 뒤에 청크가 더 날아가지 않는다 */
  const teardownGraph = useCallback(async () => {
    const graph = graphRef.current
    graphRef.current = null
    if (graph) await closeMicrophoneGraph(graph)
  }, [])

  const start = useCallback(async () => {
    if (graphRef.current) return

    setIsBusy(true)

    try {
      if (!isReady) throw new Error(t.recording.errors.modelNotReady)
      if (!(await requestMicrophonePermissionApi())) {
        throw new Error(t.recording.errors.permissionDenied)
      }

      const graph = await openMicrophoneGraph({ inputDevice: await readInputDevice(), t })

      try {
        const meetingId = await startRecordingApi({ sampleRate: graph.context.sampleRate })

        graph.node.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
          sendRecordingChunkApi({ meetingId, pcm: data }).catch(report)
        }
        graphRef.current = graph
        meetingIdRef.current = meetingId
      } catch (caught) {
        // main이 시작을 거절하면 마이크를 잡은 채로 두지 않는다
        await closeMicrophoneGraph(graph)
        throw caught
      }
    } catch (caught) {
      report(caught)
    } finally {
      setIsBusy(false)
    }
  }, [isReady, report, t])

  /** 정지와 버리기는 그래프를 먼저 끊고 main에 알리는 순서가 같다 */
  const finish = useCallback(
    async (request: (params: { meetingId: string }) => Promise<unknown>) => {
      const meetingId = meetingIdRef.current
      if (!meetingId) return

      setIsBusy(true)
      meetingIdRef.current = null

      try {
        await teardownGraph()
        await request({ meetingId })
      } catch (caught) {
        report(caught)
      } finally {
        setIsBusy(false)
      }
    },
    [report, teardownGraph]
  )

  const stop = useCallback(() => finish(stopRecordingApi), [finish])

  // 다시 마운트되면 ref만 비워지고 이전 그래프가 마이크를 잡은 채 청크를 계속 보낸다.
  // 그래프를 잃은 녹음은 이어 갈 수 없으므로 여기서 정지까지 마친다 (references/pitfalls.md)
  useEffect(
    () => () => {
      const meetingId = meetingIdRef.current
      meetingIdRef.current = null

      void teardownGraph()
        .then(() => (meetingId ? stopRecordingApi({ meetingId }) : undefined))
        .catch(report)
    },
    [report, teardownGraph]
  )

  // 전역 단축키·Tray·메인 창의 지시는 main을 거쳐 그래프 소유자인 이 창으로 온다
  useEffect(
    () =>
      onRecordingCommand(({ kind }) => {
        const isActive = meetingIdRef.current !== null

        if (kind === 'discard') void finish(discardRecordingApi)
        else if (kind === 'stop' || (kind === 'toggle' && isActive)) void stop()
        else if (kind === 'start' || kind === 'toggle') void start()
      }),
    [finish, start, stop]
  )

  return { isBusy, start, stop }
}

export default useRecorder
