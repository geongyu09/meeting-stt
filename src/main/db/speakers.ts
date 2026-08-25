import type { Speaker } from '@shared/types'
import { getDb } from './connection'

interface SpeakerRow {
  meeting_id: string
  label: string
  display_name: string | null
}

const toSpeaker = (row: SpeakerRow): Speaker => ({
  meetingId: row.meeting_id,
  label: row.label,
  displayName: row.display_name
})

export const listSpeakers = ({ meetingId }: { meetingId: string }) =>
  getDb()
    .prepare('SELECT * FROM speakers WHERE meeting_id = ? ORDER BY label')
    .all(meetingId)
    .map((row) => toSpeaker(row as SpeakerRow))

interface EnsureSpeakersParams {
  meetingId: string
  labels: string[]
}

/** 파이프라인이 찾아낸 화자 라벨을 등록한다. 이름(display_name)은 사용자가 나중에 지정한다 */
export const ensureSpeakers = ({ meetingId, labels }: EnsureSpeakersParams) => {
  const db = getDb()
  const insert = db.prepare(
    'INSERT OR IGNORE INTO speakers (meeting_id, label, display_name) VALUES (?, ?, NULL)'
  )

  db.transaction(() => {
    labels.forEach((label) => insert.run(meetingId, label))
  })()
}
