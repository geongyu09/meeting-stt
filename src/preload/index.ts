import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type GetMeetingRequest,
  type GetMeetingResponse,
  type GetMeetingsResponse,
  type PipelineProgressEvent,
  type RequestMicrophonePermissionResponse,
  type SendRecordingChunkRequest,
  type StartRecordingRequest,
  type StartRecordingResponse,
  type StopRecordingRequest,
  type StopRecordingResponse
} from '@shared/ipc'

// renderer에 노출할 API. ipcRenderer 객체 자체는 노출하지 않고
// 채널별로 타입이 붙은 함수만 여기에 추가한다 (src/shared/ipc.ts 기준).
const api = {
  recording: {
    requestPermission: (): Promise<RequestMicrophonePermissionResponse> =>
      ipcRenderer.invoke(IPC.recording.requestPermission),
    start: (payload: StartRecordingRequest): Promise<StartRecordingResponse> =>
      ipcRenderer.invoke(IPC.recording.start, payload),
    chunk: (payload: SendRecordingChunkRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.recording.chunk, payload),
    stop: (payload: StopRecordingRequest): Promise<StopRecordingResponse> =>
      ipcRenderer.invoke(IPC.recording.stop, payload)
  },
  meetings: {
    list: (): Promise<GetMeetingsResponse> => ipcRenderer.invoke(IPC.meetings.list),
    get: (payload: GetMeetingRequest): Promise<GetMeetingResponse> =>
      ipcRenderer.invoke(IPC.meetings.get, payload)
  },
  events: {
    onPipelineProgress: (listener: (event: PipelineProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: PipelineProgressEvent) => listener(payload)
      ipcRenderer.on(IPC.events.progress, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.progress, handler)
      }
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
