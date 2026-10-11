import type { AudioInputDevice } from '@shared/types'
import type { Messages } from '@shared/i18n'
import { CHUNK_SAMPLES } from '@shared/audio'
import workletUrl from '@renderer/worklet/pcmRecorder.js?url'
import { openMicrophone } from '@renderer/shared/utils/microphone'

const PROCESSOR_NAME = 'pcmRecorder'

export interface MicrophoneGraph {
  context: AudioContext
  stream: MediaStream
  node: AudioWorkletNode
}

interface OpenMicrophoneGraphParams {
  inputDevice: AudioInputDevice | null
  t: Messages
}

/**
 * 마이크 → 워크릿 → 무음 싱크 그래프를 만든다. 녹음과 받아쓰기가 같은 그래프를 쓰고 청크 목적지만 다르다
 * (references/architecture.md "받아쓰기" > "세션과 상태").
 * destination까지 이어 두지 않으면 워크릿의 process()가 호출되지 않고,
 * 게인을 0으로 두지 않으면 마이크 소리가 스피커로 되돌아간다 (references/pitfalls.md).
 */
export const openMicrophoneGraph = async ({
  inputDevice,
  t
}: OpenMicrophoneGraphParams): Promise<MicrophoneGraph> => {
  const { stream, context } = await openMicrophone({ inputDevice, t })

  try {
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

/** 청크 콜백을 먼저 떼야 닫는 동안 마지막 청크가 날아가지 않는다 */
export const closeMicrophoneGraph = async (graph: MicrophoneGraph) => {
  graph.node.port.onmessage = null
  graph.node.disconnect()
  graph.stream.getTracks().forEach((track) => track.stop())
  await graph.context.close()
}
