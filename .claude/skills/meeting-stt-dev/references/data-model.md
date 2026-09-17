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
  summary       TEXT,                       -- Phase 5 로컬 LLM 요약용
  speaker_count INTEGER                     -- 녹음 정지 시 입력한 참석자 수 → diarization num-clusters (NULL이면 임계값 폴백). 마이그레이션 2
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
  key   TEXT PRIMARY KEY,                   -- 'audio.keep' (Phase 3), 'stt.model' (Phase 4) ...
  value TEXT NOT NULL                       -- JSON 문자열
);
```

- 화자 이름은 반드시 `speakers` 매핑으로만 관리한다. `utterances.speaker_label`은 익명 라벨.
- 화자 병합(A→B)은 `utterances.speaker_label` UPDATE + `speakers` 행 삭제로 처리한다. 한 트랜잭션 안에서 함께 한다.
- 마이그레이션은 `PRAGMA user_version` 정수로 관리하고 `src/main/db/migrations.ts`에 순차 배열로 둔다.
  - 1: 초기 스키마. 2: `ALTER TABLE meetings ADD COLUMN speaker_count INTEGER` (2026-08-26, 참석자 수 → `num-clusters`).

## 편집 동작 (Phase 3)

| 동작 | SQL |
| --- | --- |
| 발화 텍스트 수정 | `UPDATE utterances SET text = ? WHERE id = ? AND meeting_id = ?` |
| 발화 화자 재배정 | `UPDATE utterances SET speaker_label = ? WHERE id = ? AND meeting_id = ?` (대상 라벨이 같은 회의의 `speakers`에 있어야 한다) |
| 화자 이름 지정 | `UPDATE speakers SET display_name = ? WHERE meeting_id = ? AND label = ?` |
| 화자 병합 A→B | 트랜잭션: `UPDATE utterances SET speaker_label = B …` + `DELETE FROM speakers WHERE label = A` |
| 회의 제목 변경 | `UPDATE meetings SET title = ? WHERE id = ?` |
| 회의 삭제 | `DELETE FROM meetings WHERE id = ?` (발화·화자는 `ON DELETE CASCADE`) + 원본 WAV 파일 삭제 |

- `ord`는 편집으로 바뀌지 않는다. 발화 순서를 사용자가 바꾸는 기능은 범위에 없다.
- 화자 재배정으로 앞뒤 발화의 화자가 같아져도 발화를 자동으로 합치지 않는다 (`references/architecture.md` 편집 UI 규칙).
- 이름을 지운(빈 문자열) 경우 `display_name`을 `NULL`로 되돌리지 않는다. 빈 값은 저장 자체를 막는다.

## 요약 저장 (Phase 5)

| 동작 | SQL |
| --- | --- |
| 요약 저장 | `UPDATE meetings SET summary = ? WHERE id = ?` |

- `meetings.summary`는 **요약 잡이 성공했을 때만** 통째로 덮어쓴다. 부분 요약(map 결과)은 저장하지 않는다 —
  회의록에서 언제든 다시 만들 수 있는 파생물이라 DB에 남길 이유가 없다.
- **요약 실패는 `meetings.status`를 건드리지 않는다.** `status`는 파이프라인(STT·화자 분리) 소유다.
  요약이 실패해도 회의록은 그대로 `'done'`이어야 하고, 실패는 `summary:progress`의 `'error'`로만 알린다.
- 회의를 지우면 요약도 함께 사라진다 (같은 행이다). 요약만 지우는 동작은 범위에 없다 — 다시 요약하면 덮어쓴다.
- 요약 중 임시 파일은 `userData/summaries/<meetingId>/`에 두고 **잡이 끝나면 실패해도 지운다**.
- 요약은 자동 실행이 아니라 사용자가 버튼으로 요청한다. 잡 큐는 파이프라인과 공유하며 동시성은 1이다
  (`{ kind: 'pipeline' | 'summary' }`). 같은 회의의 요약 잡이 이미 큐에 있으면 다시 넣지 않는다.

## settings 테이블 키

`settings`는 `key` → JSON 문자열 `value`다. 앱이 읽을 때는 `src/shared/types.ts`의 `AppSettings`로 모아서 다룬다.

| 키 | 타입 | 기본값 | 뜻 |
| --- | --- | --- | --- |
| `audio.keep` | boolean | `false` | 파이프라인 성공 후 원본 WAV를 보관할지. 끄면 삭제하고 `meetings.audio_path`를 `NULL`로 만든다 |
| `update.check` | boolean | `false` | 앱 시작 시 새 버전이 있는지 확인할지 (Phase 4). 꺼져 있으면 네트워크를 전혀 쓰지 않는다 |
| `stt.model` | `WhisperModelId` | `'turbo-q5'` | 온보딩·설정에서 고른 음성 인식 모델 (Phase 4). 모르는 값이면 기본 모델로 읽는다 |
| `pipeline.quiet` | boolean | `false` | 조용히 처리. 켜면 화자 분리 스레드를 줄이고 STT와 화자 분리를 순차로 돌린다. 느려지는 대신 발열·팬 소음이 준다. 잡이 **시작할 때** 읽으므로 진행 중인 잡에는 적용되지 않는다 (`references/architecture.md` 가속·스레드 정책) |

```ts
export interface AppSettings {
  isAudioKept: boolean
  isUpdateCheckEnabled: boolean
  isQuietProcessing: boolean
}
```

- 키는 점 표기(`audio.keep`)로 두고 TS 필드명은 코드 컨벤션(`is` 접두 boolean)을 따른다. 둘 사이 변환은 `src/main/db/settings.ts` 한 곳에서만 한다.
- 값이 없거나 JSON 파싱에 실패하면 기본값으로 읽는다 (설정 하나가 깨졌다고 앱이 뜨지 않으면 안 된다).
- **`stt.model`은 `AppSettings`에 넣지 않는다.** 모델을 바꾸는 행위는 값 하나를 저장하는 게 아니라 **다운로드를 동반**하므로
  `settings:update`가 아니라 `models:download`가 쓴다 (`references/distribution.md` 3절). 읽기는 앱 시작 시 한 번
  `src/main/db/settings.ts`의 `getWhisperModelId()` → `src/main/models/paths.ts`의 `setSelectedWhisperModelId()`로 넘긴다.
  renderer는 `models:status` 응답의 `selectedWhisperModelId`로 본다.

## 공유 타입 (`src/shared/types.ts`)

```ts
export type MeetingStatus = 'recording' | 'processing' | 'done' | 'error'

export interface Meeting {
  id: string; title: string; createdAt: number; durationSec: number
  status: MeetingStatus; errorMessage?: string; summary?: string
  speakerCount?: number   // 녹음 정지 시 입력한 참석자 수. 없으면 임계값 폴백으로 처리된 회의
}

export interface Utterance {
  id: string; meetingId: string; ord: number
  speakerLabel: string; startSec: number; endSec: number; text: string
}

export interface Speaker { meetingId: string; label: string; displayName: string | null }

export interface AppSettings { isAudioKept: boolean; isUpdateCheckEnabled: boolean; isQuietProcessing: boolean }

/** 사용자가 고를 수 있는 음성 인식 모델 (Phase 4). 목록·체크섬은 src/main/models/registry.ts */
export type WhisperModelId = 'turbo-q5' | 'large-v3-q5' | 'small-q5_1'
/** 모델 파일 종류. 'summary'만 선택 모델이고 나머지는 필수다 */
export type ModelKey = 'whisper' | 'vad' | 'segmentation' | 'embedding' | 'summary'

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

// 요약 잡의 단계. 'summarize'는 구간별 부분 요약(map), 'reduce'는 합치기.
// 회의록이 컨텍스트에 한 번에 들어가면 'reduce' 없이 'summarize' → 'done'으로 끝난다.
export type SummaryStage = 'summarize' | 'reduce' | 'done' | 'error'
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
