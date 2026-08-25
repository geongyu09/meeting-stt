import type {
  SendRecordingChunkRequest,
  StartRecordingRequest,
  StopRecordingRequest
} from '@shared/ipc'

/**
 * @description 마이크 사용 권한을 요청합니다. macOS는 시스템 권한 창을 띄우고, 그 외 플랫폼은 항상 허용으로 응답합니다.
 * @returns 권한 허용 여부
 * @example
 * const isGranted = await requestMicrophonePermissionApi()
 */
export const requestMicrophonePermissionApi = async () => {
  const { isGranted } = await window.api.recording.requestPermission()

  return isGranted
}

/**
 * @description 녹음을 시작합니다. main이 회의 행과 WAV 파일을 만들고 회의 ID를 돌려줍니다.
 * @param sampleRate - renderer의 AudioContext가 실제로 쓰는 샘플레이트
 * @returns 새로 만들어진 회의 ID
 * @example
 * const meetingId = await startRecordingApi({ sampleRate: context.sampleRate })
 */
export const startRecordingApi = async ({ sampleRate }: StartRecordingRequest) => {
  const { meetingId } = await window.api.recording.start({ sampleRate })

  return meetingId
}

/**
 * @description 녹음 중인 회의에 PCM 청크를 보냅니다. main이 즉시 파일에 append하므로 renderer는 누적하지 않습니다.
 * @param meetingId - 회의 ID
 * @param pcm - AudioWorklet이 넘긴 Float32 PCM 원본 버퍼
 * @returns 없음
 * @example
 * await sendRecordingChunkApi({ meetingId, pcm })
 */
export const sendRecordingChunkApi = async ({ meetingId, pcm }: SendRecordingChunkRequest) => {
  await window.api.recording.chunk({ meetingId, pcm })
}

/**
 * @description 녹음을 정지합니다. main이 WAV 헤더를 확정하고 파이프라인 잡을 큐에 넣습니다.
 * @param meetingId - 회의 ID
 * @returns 정지 직후의 회의 정보
 * @example
 * const meeting = await stopRecordingApi({ meetingId })
 */
export const stopRecordingApi = async ({ meetingId }: StopRecordingRequest) =>
  window.api.recording.stop({ meetingId })
