import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioInputDevice } from '@shared/types'
import {
  reportDictationErrorApi,
  sendDictationChunkApi,
  startDictationApi,
  stopDictationApi
} from '@renderer/shared/api/dictation'
import { onDictationCommand } from '@renderer/shared/api/events'
import { requestMicrophonePermissionApi } from '@renderer/shared/api/recording'
import { getSettingsApi } from '@renderer/shared/api/settings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import {
  closeMicrophoneGraph,
  openMicrophoneGraph,
  type MicrophoneGraph
} from '@renderer/shared/utils/microphoneGraph'

const messageOf = ({ caught, fallback }: { caught: unknown; fallback: string }) =>
  caught instanceof Error ? caught.message : fallback

/** 설정을 못 읽어도 받아쓰기는 막지 않는다 — 시스템 기본 마이크로 진행한다 */
const readInputDevice = (): Promise<AudioInputDevice | null> =>
  getSettingsApi()
    .then((settings) => settings.inputDevice)
    .catch((caught: unknown) => {
      console.error('입력 장치 설정을 읽지 못해 기본 마이크로 받아씁니다', caught)

      return null
    })

/**
 * 받아쓰기(음성 입력)의 마이크 그래프. 오디오 그래프의 유일한 소유자인 위젯 창 전용 훅이고,
 * 녹음과 같은 그래프를 쓰되 청크 목적지만 다르다(`dictation:chunk`). 상태는 main 세션이 들고 있으므로
 * 여기서는 그래프와 실패만 다룬다 (references/architecture.md "받아쓰기" > "세션과 상태").
 */
const useDictationRecorder = () => {
  const { t } = useLocale()
  const [isBusy, setIsBusy] = useState(false)
  const graphRef = useRef<MicrophoneGraph | null>(null)

  /** 실패는 세션에 모아 두 창이 같은 안내를 본다 */
  const report = useCallback(
    (caught: unknown) => {
      const message = messageOf({ caught, fallback: t.dictation.errors.unknown })
      reportDictationErrorApi({ message }).catch(() =>
        console.error(`받아쓰기 오류를 알리지 못했습니다: ${message}`)
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
      if (!(await requestMicrophonePermissionApi())) {
        throw new Error(t.recording.errors.permissionDenied)
      }

      const graph = await openMicrophoneGraph({ inputDevice: await readInputDevice(), t })

      try {
        await startDictationApi({ sampleRate: graph.context.sampleRate })

        graph.node.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
          sendDictationChunkApi({ pcm: data }).catch(report)
        }
        graphRef.current = graph
      } catch (caught) {
        // main이 시작을 거절하면(녹음 중·모델 없음) 마이크를 잡은 채로 두지 않는다
        await closeMicrophoneGraph(graph)
        throw caught
      }
    } catch (caught) {
      report(caught)
    } finally {
      setIsBusy(false)
    }
  }, [report, t])

  const stop = useCallback(async () => {
    if (!graphRef.current) return

    setIsBusy(true)

    try {
      await teardownGraph()
      await stopDictationApi()
    } catch (caught) {
      report(caught)
    } finally {
      setIsBusy(false)
    }
  }, [report, teardownGraph])

  // 다시 마운트되면 ref만 비워지고 이전 그래프가 마이크를 잡은 채 청크를 계속 보낸다 (references/pitfalls.md)
  useEffect(
    () => () => {
      const hadGraph = graphRef.current !== null

      void teardownGraph()
        .then(() => (hadGraph ? stopDictationApi() : undefined))
        .catch(report)
    },
    [report, teardownGraph]
  )

  // 전역 단축키·메뉴바·메인 창의 지시는 main을 거쳐 그래프 소유자인 이 창으로 온다. 토글은 main이 이미 풀었다
  useEffect(
    () =>
      onDictationCommand(({ kind }) => {
        if (kind === 'stop') void stop()
        else void start()
      }),
    [start, stop]
  )

  return { isBusy, start, stop }
}

export default useDictationRecorder
