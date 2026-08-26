import { randomUUID } from 'node:crypto'
import type { MergedUtterance, Utterance } from '@shared/types'
import { getDb } from './connection'

interface UtteranceRow {
  id: string
  meeting_id: string
  ord: number
  speaker_label: string
  start_sec: number
  end_sec: number
  text: string
}

const toUtterance = (row: UtteranceRow): Utterance => ({
  id: row.id,
  meetingId: row.meeting_id,
  ord: row.ord,
  speakerLabel: row.speaker_label,
  startSec: row.start_sec,
  endSec: row.end_sec,
  text: row.text
})

export const listUtterances = ({ meetingId }: { meetingId: string }) =>
  getDb()
    .prepare('SELECT * FROM utterances WHERE meeting_id = ? ORDER BY ord')
    .all(meetingId)
    .map((row) => toUtterance(row as UtteranceRow))

interface UpdateUtteranceTextParams {
  meetingId: string
  utteranceId: string
  text: string
}

/** meeting_id를 함께 걸어 다른 회의의 발화를 고치지 못하게 한다 */
export const updateUtteranceText = ({ meetingId, utteranceId, text }: UpdateUtteranceTextParams) =>
  getDb()
    .prepare(
      'UPDATE utterances SET text = @text WHERE id = @utteranceId AND meeting_id = @meetingId'
    )
    .run({ meetingId, utteranceId, text }).changes

interface UpdateUtteranceSpeakerParams {
  meetingId: string
  utteranceId: string
  speakerLabel: string
}

export const updateUtteranceSpeaker = ({
  meetingId,
  utteranceId,
  speakerLabel
}: UpdateUtteranceSpeakerParams) =>
  getDb()
    .prepare(
      `UPDATE utterances SET speaker_label = @speakerLabel
       WHERE id = @utteranceId AND meeting_id = @meetingId`
    )
    .run({ meetingId, utteranceId, speakerLabel }).changes

interface ReplaceUtterancesParams {
  meetingId: string
  utterances: MergedUtterance[]
}

/** 파이프라인 결과 저장. 재처리해도 중복이 남지 않도록 기존 발화를 지우고 다시 넣는다 */
export const replaceUtterances = ({ meetingId, utterances }: ReplaceUtterancesParams) => {
  const db = getDb()
  const remove = db.prepare('DELETE FROM utterances WHERE meeting_id = ?')
  const insert = db.prepare(
    `INSERT INTO utterances (id, meeting_id, ord, speaker_label, start_sec, end_sec, text)
     VALUES (@id, @meetingId, @ord, @speakerLabel, @startSec, @endSec, @text)`
  )

  db.transaction(() => {
    remove.run(meetingId)
    utterances.forEach((utterance) => insert.run({ ...utterance, id: randomUUID(), meetingId }))
  })()
}
