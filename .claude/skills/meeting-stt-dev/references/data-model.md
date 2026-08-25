# 데이터 모델

## SQLite 스키마 (better-sqlite3, main 프로세스)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meetings (
  id            TEXT PRIMARY KEY,           -- uuid
  title         TEXT NOT NULL,              -- 기본값: "2026-08-25 회의"
  created_at    INTEGER NOT NULL,           -- epoch ms
  duration_sec  REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL,              -- 'recording' | 'processing' | 'done' | 'error'
  error_message TEXT,
  audio_path    TEXT,                       -- 원본 WAV 경로 (삭제 후 NULL)
  summary       TEXT                        -- Phase 5 로컬 LLM 요약용
);

CREATE TABLE IF NOT EXISTS utterances (
  id            TEXT PRIMARY KEY,
  meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  ord           INTEGER NOT NULL,           -- 표시 순서
  speaker_label TEXT NOT NULL,              -- 'SPEAKER_00' (원본 라벨, 재배정 시 갱신)
  start_sec     REAL NOT NULL,
  end_sec       REAL NOT NULL,
  text          TEXT NOT NULL               -- 사용자 수정 시 갱신
);
CREATE INDEX IF NOT EXISTS idx_utterances_meeting ON utterances(meeting_id, ord);

CREATE TABLE IF NOT EXISTS speakers (
  meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,              -- 'SPEAKER_00'
  display_name  TEXT,                       -- 사용자 지정 이름 (NULL이면 "화자 1" 식으로 표시)
  PRIMARY KEY (meeting_id, label)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,                   -- 'stt.model', 'keepAudio', 'diarize.threshold' ...
  value TEXT NOT NULL                       -- JSON 문자열
);
```

- 화자 이름은 반드시 `speakers` 매핑으로만 관리한다. `utterances.speaker_label`은 익명 라벨.
- 화자 병합(A→B)은 `utterances.speaker_label` UPDATE + `speakers` 행 삭제로 처리한다.
- 마이그레이션은 `PRAGMA user_version` 정수로 관리하고 `src/main/db/migrations.ts`에 순차 배열로 둔다.

## 공유 타입 (`src/shared/types.ts`)

```ts
export type MeetingStatus = 'recording' | 'processing' | 'done' | 'error'

export interface Meeting {
  id: string; title: string; createdAt: number; durationSec: number
  status: MeetingStatus; errorMessage?: string; summary?: string
}

export interface Utterance {
  id: string; meetingId: string; ord: number
  speakerLabel: string; startSec: number; endSec: number; text: string
}

export interface Speaker { meetingId: string; label: string; displayName: string | null }

/** 디테일 화면이 한 번에 받는 묶음 (meetings:get 응답) */
export interface MeetingDetail { meeting: Meeting; utterances: Utterance[]; speakers: Speaker[] }

// 파이프라인 중간 산출물
export interface SttWord    { start: number; end: number; text: string }
export interface SttSegment { start: number; end: number; text: string; words?: SttWord[] }
export interface SpeakerSegment { start: number; end: number; speaker: string }
export interface SpeakerPiece  { speaker: string; start: number; end: number; text: string }
export type MergedUtterance = Omit<Utterance, 'id' | 'meetingId'>

// 'vad'는 whisper 내장이라 별도 단계가 없다. 'done'·'error'는 잡의 마지막에 한 번만 보낸다.
export type PipelineStage = 'stt' | 'diarize' | 'merge' | 'save' | 'done' | 'error'
```

진행률 이벤트 payload(`PipelineProgressEvent`)는 프로세스 간 계약이므로 `src/shared/types.ts`가 아니라
`src/shared/ipc.ts`에 둔다 (`.claude/rules/ipc-api-guide.md`).

## 식별자

- `meetings.id`·`utterances.id`는 **uuid 문자열**(`node:crypto`의 `randomUUID`)이다. 정수 자동 증가를 쓰지 않는다 —
  녹음 시작 시점(파일명 결정)에 main이 id를 먼저 정해야 하고, 나중에 파일 기반 내보내기·복구에서 충돌이 없어야 하기 때문이다.
- 따라서 IPC payload의 `meetingId`·`utteranceId`도 전부 `string`이다.

## 병합 알고리즘 (`src/shared/merge.ts`, 순수 함수)

1. `SpeakerSegment[]`를 start 기준 정렬해 두고, 각 단어(없으면 세그먼트)에 대해 **겹침 길이가 최대인 화자**를 배정한다. 세그먼트 수가 수천 개가 되므로 이진 탐색으로 후보 구간을 좁힌다 (WhisperX 방식).
2. 겹치는 화자 구간이 없으면 **1초 이내에서 가장 가까운 화자 구간**에 배정한다 — 화자 전환 경계의 단어는 타임스탬프 오차 때문에 어느 구간에도 걸치지 않는 일이 잦다. 그래도 없으면 직전 단어의 화자를 승계하고, 그것도 없으면 `UNKNOWN`.
3. 연속된 동일 화자 단어를 하나의 발화로 묶고, 같은 화자의 연속 발화는 문단으로 병합한다.
4. 0.5초 미만 고아 발화는 앞뒤 발화에 흡수한다.
5. 결과는 `Omit<Utterance, 'id' | 'meetingId'>[]` (ord 부여 완료) 형태로 반환한다.

테스트(`pnpm test`, vitest)에는 최소 다음 케이스를 둔다: 단일 화자, 세그먼트 중간 화자 전환, 겹침 없는 단어, 고아 발화 흡수, 빈 입력.

## 복사 포맷 (`src/shared/format.ts`)

```
[00:00:12] 김OO: 지난주 논의했던 배포 일정부터 정리하겠습니다.
[00:00:25] 이OO: 네, QA 쪽 이슈가 하나 남아 있습니다.
```

- 플레인 텍스트가 기본, 마크다운 옵션은 화자를 `**굵게**`.
- 이름은 `speakers.display_name ?? "화자 N"`. 번호 N은 **이름 지정 여부와 무관하게 등장 순서**로 매긴다 — 한 화자의 이름을 바꿔도 나머지 번호가 밀리지 않아야 한다.
- 화자를 배정하지 못한 `UNKNOWN` 라벨은 번호를 쓰지 않고 `화자 미상`으로 표기한다.
- 타임스탬프는 `hh:mm:ss` 고정폭.
