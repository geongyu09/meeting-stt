import { ipcMain, systemPreferences } from 'electron'
import {
  IPC,
  type GetMeetingRequest,
  type GetMeetingResponse,
  type GetMeetingsResponse,
  type RequestMicrophonePermissionResponse,
  type StartRecordingRequest,
  type StartRecordingResponse,
  type StopRecordingResponse
} from '@shared/ipc'
import { appendRecordingChunk, startRecording, stopRecording } from '../audio/session'
import { findMeeting, listMeetings } from '../db/meetings'
import { listSpeakers } from '../db/speakers'
import { listUtterances } from '../db/utterances'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** renderer가 보낸 payload는 신뢰하지 않는다 (.claude/rules/ipc-api-guide.md) */
const readMeetingId = (payload: unknown) => {
  if (!isRecord(payload) || typeof payload.meetingId !== 'string' || !payload.meetingId) {
    throw new Error('잘못된 요청입니다 (meetingId 없음)')
  }

  return payload.meetingId
}

const readSampleRate = (payload: unknown) => {
  if (!isRecord(payload) || typeof payload.sampleRate !== 'number') {
    throw new Error('잘못된 요청입니다 (sampleRate 없음)')
  }

  return (payload as unknown as StartRecordingRequest).sampleRate
}

const readPcm = (payload: unknown) => {
  if (!isRecord(payload) || !(payload.pcm instanceof ArrayBuffer)) {
    throw new Error('잘못된 요청입니다 (PCM 청크 없음)')
  }

  return payload.pcm
}

/** macOS만 명시적 요청이 필요하다. 그 외 플랫폼은 getUserMedia 실패로 처리한다 */
const requestMicrophonePermission = async (): Promise<RequestMicrophonePermissionResponse> => {
  if (process.platform !== 'darwin') return { isGranted: true }

  return { isGranted: await systemPreferences.askForMediaAccess('microphone') }
}

const getMeetingDetail = ({ meetingId }: GetMeetingRequest): GetMeetingResponse => {
  const meeting = findMeeting({ meetingId })
  if (!meeting) return null

  return {
    meeting,
    utterances: listUtterances({ meetingId }),
    speakers: listSpeakers({ meetingId })
  }
}

export const registerIpcHandlers = () => {
  ipcMain.handle(IPC.recording.requestPermission, () => requestMicrophonePermission())

  ipcMain.handle(IPC.recording.start, (_event, payload): Promise<StartRecordingResponse> =>
    startRecording({ sampleRate: readSampleRate(payload) })
  )

  ipcMain.handle(IPC.recording.chunk, (_event, payload) =>
    appendRecordingChunk({ meetingId: readMeetingId(payload), pcm: readPcm(payload) })
  )

  ipcMain.handle(IPC.recording.stop, (_event, payload): Promise<StopRecordingResponse> =>
    stopRecording({ meetingId: readMeetingId(payload) })
  )

  ipcMain.handle(IPC.meetings.list, (): GetMeetingsResponse => listMeetings())

  ipcMain.handle(IPC.meetings.get, (_event, payload): GetMeetingResponse =>
    getMeetingDetail({ meetingId: readMeetingId(payload) })
  )
}
