import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { MEETING_AUDIO_HOST, MEETING_AUDIO_SCHEME } from '@shared/ipc'
import { findAudioPath } from '../db/meetings'
import { messageOf, warn } from '../log'
import { parseByteRange } from './byteRange'

const WAV_CONTENT_TYPE = 'audio/wav'

/**
 * `app.whenReady()` 전에 불러야 한다. `stream`이 없으면 `<audio>`가 응답 전체를 받은 뒤에야 재생하고,
 * `standard`가 없으면 `meeting-audio://recording/<id>`의 호스트·경로가 해석되지 않는다.
 */
export const registerMeetingAudioScheme = () => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEETING_AUDIO_SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
    }
  ])
}

const statusResponse = (status: number) => new Response(null, { status })

const meetingIdOf = (url: URL) => {
  if (url.host !== MEETING_AUDIO_HOST) return null

  const meetingId = decodeURIComponent(url.pathname.replace(/^\//, ''))

  return meetingId && !meetingId.includes('/') ? meetingId : null
}

/** 파일 경로는 renderer에 노출하지 않는다. 회의 ID로 DB의 audio_path를 찾는다 (references/architecture.md) */
const serveMeetingAudio = async (request: Request) => {
  const meetingId = meetingIdOf(new URL(request.url))
  if (!meetingId) return statusResponse(404)

  const audioPath = findAudioPath({ meetingId })
  if (!audioPath) return statusResponse(404)

  try {
    const { size } = await stat(audioPath)
    const range = parseByteRange({ header: request.headers.get('range'), size })

    if (range === 'unsatisfiable') {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }

    const { start, end } = range ?? { start: 0, end: size - 1 }
    const body = Readable.toWeb(createReadStream(audioPath, { start, end })) as ReadableStream

    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': WAV_CONTENT_TYPE,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
      }
    })
  } catch (caught) {
    warn(`회의 ${meetingId} 원본 녹음 재생 실패: ${messageOf(caught)}`)

    return statusResponse(404)
  }
}

/** 앱이 준비된 뒤 한 번 등록한다 */
export const handleMeetingAudioProtocol = () => {
  protocol.handle(MEETING_AUDIO_SCHEME, serveMeetingAudio)
}
