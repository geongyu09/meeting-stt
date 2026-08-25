import type { Meeting, MeetingStatus } from '@shared/types'
import { getDb } from './connection'

interface MeetingRow {
  id: string
  title: string
  created_at: number
  duration_sec: number
  status: MeetingStatus
  error_message: string | null
  audio_path: string | null
  summary: string | null
}

const toMeeting = (row: MeetingRow): Meeting => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  durationSec: row.duration_sec,
  status: row.status,
  ...(row.error_message ? { errorMessage: row.error_message } : {}),
  ...(row.summary ? { summary: row.summary } : {})
})

interface InsertMeetingParams {
  id: string
  title: string
  createdAt: number
  audioPath: string
}

export const insertMeeting = ({ id, title, createdAt, audioPath }: InsertMeetingParams) => {
  getDb()
    .prepare(
      `INSERT INTO meetings (id, title, created_at, duration_sec, status, audio_path)
       VALUES (@id, @title, @createdAt, 0, 'recording', @audioPath)`
    )
    .run({ id, title, createdAt, audioPath })
}

export const listMeetings = () =>
  getDb()
    .prepare('SELECT * FROM meetings ORDER BY created_at DESC')
    .all()
    .map((row) => toMeeting(row as MeetingRow))

export const findMeeting = ({ meetingId }: { meetingId: string }) => {
  const row = getDb().prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId)

  return row ? toMeeting(row as MeetingRow) : null
}

export const findAudioPath = ({ meetingId }: { meetingId: string }) => {
  const row = getDb().prepare('SELECT audio_path FROM meetings WHERE id = ?').get(meetingId) as
    | Pick<MeetingRow, 'audio_path'>
    | undefined

  return row?.audio_path ?? null
}

interface UpdateMeetingStatusParams {
  meetingId: string
  status: MeetingStatus
  errorMessage?: string
}

export const updateMeetingStatus = ({
  meetingId,
  status,
  errorMessage
}: UpdateMeetingStatusParams) => {
  getDb()
    .prepare('UPDATE meetings SET status = @status, error_message = @errorMessage WHERE id = @meetingId')
    .run({ meetingId, status, errorMessage: errorMessage ?? null })
}

export const updateMeetingDuration = ({
  meetingId,
  durationSec
}: {
  meetingId: string
  durationSec: number
}) => {
  getDb()
    .prepare('UPDATE meetings SET duration_sec = @durationSec WHERE id = @meetingId')
    .run({ meetingId, durationSec })
}

/** 이전 실행이 녹음·처리 중에 죽은 경우 남는 행. 시작 시 한 번 정리한다 */
export const failStaleMeetings = () =>
  getDb()
    .prepare(
      `UPDATE meetings
       SET status = 'error', error_message = '앱이 종료되어 처리가 중단되었습니다'
       WHERE status IN ('recording', 'processing')`
    )
    .run().changes
