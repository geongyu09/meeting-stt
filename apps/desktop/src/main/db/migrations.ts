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
  'ALTER TABLE meetings ADD COLUMN speaker_count INTEGER;',
  // 3: 교정 제안(RefinePair[] JSON)과 회의별 용어(string[] JSON). 둘 다 회의와 함께 사라지는 파생물이라 컬럼으로 둔다
  `
  ALTER TABLE meetings ADD COLUMN refine_pairs TEXT;
  ALTER TABLE meetings ADD COLUMN glossary_terms TEXT;
  `,
  // 4: 자동 교정으로 전환 (2026-09-25). 회의별 용어는 없애고, 제안 컬럼은 "반영한 쌍"으로 뜻이 바뀌므로 이름을 바꾸고
  //    미확정 제안(반영된 적 없음)은 비운다. refined_at이 NULL이면 아직 교정하지 않은 회의다 (references/data-model.md)
  `
  ALTER TABLE meetings DROP COLUMN glossary_terms;
  ALTER TABLE meetings RENAME COLUMN refine_pairs TO refine_applied;
  UPDATE meetings SET refine_applied = NULL;
  ALTER TABLE meetings ADD COLUMN refined_at INTEGER;
  `
]

export const migrate = (db: Database) => {
  const current = db.pragma('user_version', { simple: true }) as number

  MIGRATIONS.slice(current).forEach((sql, index) => {
    db.exec(sql)
    db.pragma(`user_version = ${current + index + 1}`)
  })
}
