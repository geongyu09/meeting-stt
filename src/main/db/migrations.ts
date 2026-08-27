import type { Database } from 'better-sqlite3'

/**
 * user_version 기준 순차 마이그레이션. 배열에 추가만 하고 기존 항목은 수정하지 않는다
 * (references/data-model.md).
 */
const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS meetings (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    duration_sec  REAL NOT NULL DEFAULT 0,
    status        TEXT NOT NULL,
    error_message TEXT,
    audio_path    TEXT,
    summary       TEXT
  );

  CREATE TABLE IF NOT EXISTS utterances (
    id            TEXT PRIMARY KEY,
    meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    ord           INTEGER NOT NULL,
    speaker_label TEXT NOT NULL,
    start_sec     REAL NOT NULL,
    end_sec       REAL NOT NULL,
    text          TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_utterances_meeting ON utterances(meeting_id, ord);

  CREATE TABLE IF NOT EXISTS speakers (
    meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    label         TEXT NOT NULL,
    display_name  TEXT,
    PRIMARY KEY (meeting_id, label)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2: 녹음 정지 시 입력한 참석자 수. 화자 분리의 num-clusters가 된다 (references/data-model.md)
  'ALTER TABLE meetings ADD COLUMN speaker_count INTEGER;'
]

export const migrate = (db: Database) => {
  const current = db.pragma('user_version', { simple: true }) as number

  MIGRATIONS.slice(current).forEach((sql, index) => {
    db.exec(sql)
    db.pragma(`user_version = ${current + index + 1}`)
  })
}
