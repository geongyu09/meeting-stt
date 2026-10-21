import { audioQualityIssueOf, type AudioQualityMetrics } from '@shared/audioQuality'
import type { MeetingSearchResult } from '@shared/ipc'
import type { Meeting, MeetingAudioFile, MeetingStatus } from '@shared/types'
import { SEARCH_RESULT_LIMIT, toLikePattern } from '../searchQuery'
import { getDb } from './connection'
import { t } from '../locale'

interface MeetingRow {
  id: string
  title: string
  created_at: number
  duration_sec: number
  status: MeetingStatus
  error_message: string | null
  audio_path: string | null
  summary: string | null
  speaker_count: number | null
  audio_quality: string | null
}

const toMeeting = (row: MeetingRow): Meeting => {
  // 판정은 저장하지 않고 읽을 때 계산한다 (references/data-model.md "녹음 품질 지표 저장")
  const audioQualityIssue = audioQualityIssueOf(row.audio_quality)

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    durationSec: row.duration_sec,
    status: row.status,
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.speaker_count ? { speakerCount: row.speaker_count } : {}),
    hasAudio: row.audio_path !== null,
    ...(audioQualityIssue ? { audioQualityIssue } : {})
  }
}

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

interface SearchRow extends MeetingRow {
  match_utterance_id: string | null
  match_text: string | null
  match_start_sec: number | null
}

const toSearchResult = (row: SearchRow): MeetingSearchResult => ({
  meeting: toMeeting(row),
  match:
    row.match_utterance_id && row.match_text !== null && row.match_start_sec !== null
      ? { utteranceId: row.match_utterance_id, text: row.match_text, startSec: row.match_start_sec }
      : null
})

/**
 * 회의 제목과 발화 텍스트를 LIKE로 전체 스캔한다. 발화로 걸리면 순서가 가장 앞선 발화 하나를 함께 준다.
 * FTS5를 쓰지 않는 이유는 references/architecture.md "회의록 검색".
 */
export const searchMeetings = ({ query }: { query: string }) => {
  const pattern = toLikePattern(query)
  if (!pattern) return []

  return getDb()
    .prepare(
      `WITH first_match AS (
         SELECT u.meeting_id, u.id, u.text, u.start_sec,
                ROW_NUMBER() OVER (PARTITION BY u.meeting_id ORDER BY u.ord) AS rank
         FROM utterances u
         WHERE u.text LIKE @pattern ESCAPE '\\'
       )
       SELECT m.*, f.id AS match_utterance_id, f.text AS match_text, f.start_sec AS match_start_sec
       FROM meetings m
       LEFT JOIN first_match f ON f.meeting_id = m.id AND f.rank = 1
       WHERE f.id IS NOT NULL OR m.title LIKE @pattern ESCAPE '\\'
       ORDER BY m.created_at DESC
       LIMIT @limit`
    )
    .all({ pattern, limit: SEARCH_RESULT_LIMIT })
    .map((row) => toSearchResult(row as SearchRow))
}

/** 녹음 파일이 남은 회의. 녹음 중인 회의는 파일이 확정되지 않아 뺀다 (references/data-model.md "녹음 파일 관리") */
export const listMeetingsWithAudio = () =>
  getDb()
    .prepare(
      `SELECT id, title, created_at, duration_sec, status, audio_path FROM meetings
       WHERE audio_path IS NOT NULL AND status != 'recording' ORDER BY created_at DESC`
    )
    .all()
    .map((row) => {
      const { id, title, created_at, duration_sec, status, audio_path } = row as MeetingRow

      return {
        file: { meetingId: id, title, createdAt: created_at, durationSec: duration_sec, status },
        audioPath: audio_path as string
      }
    }) as { file: Omit<MeetingAudioFile, 'sizeBytes'>; audioPath: string }[]

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

/** 파이프라인이 원본 WAV에서 잰 품질 지표. 판정은 읽을 때 한다 (references/data-model.md "녹음 품질 지표 저장") */
export const updateMeetingAudioQuality = ({
  meetingId,
  audioQuality
}: {
  meetingId: string
  audioQuality: AudioQualityMetrics
}) => {
  getDb()
    .prepare('UPDATE meetings SET audio_quality = @audioQuality WHERE id = @meetingId')
    .run({ meetingId, audioQuality: JSON.stringify(audioQuality) })
}

/** 녹음 정지 시 입력한 참석자 수. 파이프라인이 화자 분리 전에 읽는다 */
export const updateMeetingSpeakerCount = ({
  meetingId,
  speakerCount
}: {
  meetingId: string
  speakerCount: number
}) => {
  getDb()
    .prepare('UPDATE meetings SET speaker_count = @speakerCount WHERE id = @meetingId')
    .run({ meetingId, speakerCount })
}

/**
 * 다시 인식 요청. 참석자 수를 바꾸고(null이면 임계값 폴백) 바로 처리 중으로 표시한다 —
 * 큐에서 기다리는 동안 두 번 요청되지 않고, 화면이 진행률을 보인다 (references/data-model.md "다시 인식").
 */
export const markMeetingReprocessing = ({
  meetingId,
  speakerCount
}: {
  meetingId: string
  speakerCount: number | null
}) => {
  getDb()
    .prepare(
      `UPDATE meetings
       SET speaker_count = @speakerCount, status = 'processing', error_message = NULL
       WHERE id = @meetingId`
    )
    .run({ meetingId, speakerCount })
}

/** 제목을 바꾼다. 대상 회의가 없으면 0을 돌려준다 */
export const renameMeeting = ({ meetingId, title }: { meetingId: string; title: string }) =>
  getDb().prepare('UPDATE meetings SET title = @title WHERE id = @meetingId').run({
    meetingId,
    title
  }).changes

/** 녹음 노트를 쓴다. 대상 회의가 없으면 0을 돌려준다 (references/data-model.md "녹음 노트 저장") */
export const updateMeetingNote = ({ meetingId, note }: { meetingId: string; note: string }) =>
  getDb().prepare('UPDATE meetings SET note = @note WHERE id = @meetingId').run({ meetingId, note })
    .changes

/** 녹음 노트. 회의가 없거나 노트가 없으면 빈 문자열이다 */
export const findMeetingNote = ({ meetingId }: { meetingId: string }) => {
  const row = getDb().prepare('SELECT note FROM meetings WHERE id = ?').get(meetingId) as
    { note: string } | undefined

  return row?.note ?? ''
}

/** 비서의 뇌에 저장한 원문의 절대 경로. 보낸 적 없으면 null (references/features/assistant.md "녹음 기록 자동 정리") */
export const findBrainPath = ({ meetingId }: { meetingId: string }) => {
  const row = getDb().prepare('SELECT brain_path FROM meetings WHERE id = ?').get(meetingId) as
    { brain_path: string | null } | undefined

  return row?.brain_path ?? null
}

export const updateMeetingBrainPath = ({
  meetingId,
  brainPath
}: {
  meetingId: string
  brainPath: string
}) => {
  getDb()
    .prepare('UPDATE meetings SET brain_path = @brainPath WHERE id = @meetingId')
    .run({ meetingId, brainPath })
}

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
       SET status = 'error', error_message = @errorMessage
       WHERE status IN ('recording', 'processing')`
    )
    .run({ errorMessage: t().main.pipeline.interruptedByQuit }).changes
