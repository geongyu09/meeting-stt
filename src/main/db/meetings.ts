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
    Pick<MeetingRow, 'audio_path'> | undefined

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
    .prepare(
      'UPDATE meetings SET status = @status, error_message = @errorMessage WHERE id = @meetingId'
    )
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

/** 제목을 바꾼다. 대상 회의가 없으면 0을 돌려준다 */
export const renameMeeting = ({ meetingId, title }: { meetingId: string; title: string }) =>
  getDb().prepare('UPDATE meetings SET title = @title WHERE id = @meetingId').run({
    meetingId,
    title
  }).changes

/** 원본 WAV를 지운 뒤 경로를 비운다. 파일이 없는 회의는 재처리할 수 없다 */
export const clearAudioPath = ({ meetingId }: { meetingId: string }) => {
  getDb().prepare('UPDATE meetings SET audio_path = NULL WHERE id = ?').run(meetingId)
}

/** 발화·화자는 ON DELETE CASCADE로 함께 지워진다 (references/data-model.md) */
export const deleteMeeting = ({ meetingId }: { meetingId: string }) =>
  getDb().prepare('DELETE FROM meetings WHERE id = ?').run(meetingId).changes

/** 로컬 LLM 요약 결과를 저장한다 (Phase 5). 다시 만들면 덮어쓴다 */
export const updateMeetingSummary = ({
  meetingId,
  summary
}: {
  meetingId: string
  summary: string
}) =>
  getDb()
    .prepare('UPDATE meetings SET summary = @summary WHERE id = @meetingId')
    .run({ meetingId, summary }).changes > 0

/** 이전 실행이 녹음·처리 중에 죽은 경우 남는 행. 시작 시 한 번 정리한다 */
export const failStaleMeetings = () =>
  getDb()
    .prepare(
      `UPDATE meetings
       SET status = 'error', error_message = '앱이 종료되어 처리가 중단되었습니다'
       WHERE status IN ('recording', 'processing')`
    )
    .run().changes
