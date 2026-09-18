---
paths:
  - "src/**"
description: 프로세스 경계(main / preload / renderer / shared)와 전체 폴더 구조, 레이어별 역할, 네이밍 원칙. 새 파일·폴더 생성이나 파일 위치 판단 전 필독.
---

# 프로젝트 폴더 구조 가이드라인

폴더 구조는 '변경에 유연함'을 판단 근거로 잡았기 때문에, 아래 모든 규칙은 **"코드가 어떤 이유로 함께 바뀌는가"** 를 따라 결정됨.
이 프로젝트는 Electron 앱이므로 그 위에 **프로세스 경계**가 한 겹 더 있음. 먼저 프로세스를 정하고, renderer 안에서는 React 레이어 규칙을 적용.

세부 규칙은 역할별 문서 참고.

- 컴포넌트 위치(추상화 레벨): `.claude/rules/component-abstract-pattern.md`
- 컴포넌트 폴더 구성(콜로케이션): `.claude/rules/component-colocation-pattern.md`
- 세그먼트 정의·배치·의존 규칙: `.claude/rules/segment-pattern.md`
- IPC·API 구조: `.claude/rules/ipc-api-guide.md`
- 훅: `.claude/rules/hook-guide.md`
- 테스트: `.claude/rules/test-strategy.md`

## 프로세스 경계

| 위치 | 런타임 | 역할 | 금지 |
| --- | --- | --- | --- |
| `src/shared` | 양쪽 (순수 TS) | 도메인 타입, IPC 채널·payload 타입, 병합·포맷 같은 순수 함수 | 런타임 의존(`electron`, `fs`, `react`) 일체 |
| `src/main` | Node | 창 생성, 녹음 파일 쓰기, 파이프라인(spawn), SQLite, 모델 관리, IPC 핸들러 | `react`, 동기 IO(`spawnSync`, 요청 경로의 `readFileSync`) |
| `src/preload` | Node (contextBridge) | `window.api`에 타입 붙은 함수만 노출 | `ipcRenderer` 객체 직접 노출, 비즈니스 로직 |
| `src/renderer/src` | Chromium (React) | 화면, 녹음 오디오 수집(AudioWorklet), `window.api` 호출·이벤트 구독 | `fs`, `child_process`, `electron`, `better-sqlite3` import, 추론·DB 접근 |

- 의존 방향: `renderer → shared`, `main → shared`, `preload → shared`. `shared`는 아무것도 의존하지 않음.
- **`src/shared`(프로세스 공용)와 `src/renderer/src/shared`(renderer 전용 공용)는 다른 폴더.** 별칭으로 구분: `@shared/*` = 프로세스 공용, `@renderer/shared/*` = renderer 공용. renderer 공용 코드는 `@shared`를 import할 수 있지만 그 반대는 불가.
  - `@shared/*` 별칭은 `src/shared` 생성 시 `tsconfig.web.json`·`tsconfig.node.json`·`electron.vite.config.ts`(main/preload/renderer 모두)에 함께 추가.

## 전체 폴더 구조

```
src/
├── shared/                              # 프로세스 공용 순수 TS (플랫 파일, vitest)
│   ├── types.ts                         # Meeting, MeetingDetail, Utterance, Speaker, SttSegment
│   ├── ipc.ts                           # IPC 채널 상수 + 요청/응답/이벤트 payload 타입
│   ├── audio.ts                         # 샘플레이트·청크 크기 (renderer/main 공용)
│   ├── merge.ts                         # assignSpeakers, mergeUtterances (순수 함수)
│   ├── merge.test.ts                    # 단위 테스트
│   ├── format.ts                        # 타임스탬프·복사용 텍스트 조립
│   └── format.test.ts
│
├── main/                                # Node 프로세스 (플랫 파일, 역할별 폴더)
│   ├── index.ts                         # 창 생성, 권한 요청, ipc 등록
│   ├── log.ts                           # 운영 로그 (console 직접 호출 금지)
│   ├── audio/wavWriter.ts
│   ├── pipeline/{queue,run,whisper,diarize}.ts
│   ├── db/{connection,migrations,meetings,utterances,speakers}.ts
│   ├── models/{registry,paths,download,recommend,service}.ts
│   ├── summary/{llama,run,paths,transcript}.ts
│   ├── updater.ts
│   ├── bin/{paths,spawn}.ts
│   └── ipc/handlers.ts
│
├── preload/
│   ├── index.ts                         # window.api (채널별 타입 붙은 함수)
│   └── index.d.ts                       # Window.api 타입 선언
│
└── renderer/
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── assets/                      # 전역 css (CSS 변수 토큰은 base.css)
        ├── worklet/pcmRecorder.js       # AudioWorkletProcessor (`?url`로 import)
        │
        ├── pages/                       # 라우트 화면. widgets 배치만
        │   ├── Onboarding/index.tsx
        │   ├── Home/index.tsx
        │   ├── Record/index.tsx
        │   └── MeetingDetail/index.tsx
        │
        ├── modules/                     # 도메인 로직을 가진 컴포넌트
        │   ├── widgets/{domain}/AComponent/
        │   │   ├── index.tsx
        │   │   ├── index.module.css     # CSS Modules (세그먼트 아님, index.tsx 옆)
        │   │   ├── ui/
        │   │   │   ├── LoadingFallback.tsx
        │   │   │   └── ErrorFallback.tsx
        │   │   ├── model/
        │   │   │   └── use{Domain}.ts
        │   │   ├── context/
        │   │   │   └── {domain}Context.tsx
        │   │   ├── types/
        │   │   │   └── {domain}.ts
        │   │   └── test.tsx             # 통합 테스트
        │   └── features/{domain}/BComponent/
        │       ├── index.tsx
        │       ├── model/
        │       │   └── use{Domain}.ts
        │       └── utils/
        │           ├── formatDate.ts
        │           └── formatDate.test.ts
        │
        ├── shared/                      # renderer 전용 공용 코드
        │   ├── api/                     # window.api 래퍼 (유일한 window.api 접점)
        │   │   ├── meetings/index.ts
        │   │   ├── recording/index.ts
        │   │   ├── speakers/index.ts
        │   │   └── events/index.ts
        │   ├── components/
        │   │   ├── primitives/
        │   │   │   ├── ui/Button/index.tsx
        │   │   │   ├── layout/
        │   │   │   └── animation/
        │   │   └── composites/
        │   ├── hooks/
        │   │   ├── common/useInterval/index.ts
        │   │   └── domain/{domain}/useXxx/index.ts
        │   ├── provider/
        │   │   ├── context/{name}Context/index.tsx
        │   │   └── themeProvider/index.tsx
        │   ├── routes/{index.tsx,paths.ts,guards.tsx}   # 라우터 정의, path 상수, 가드
        │   ├── utils/
        │   │   └── formatDuration/
        │   │       ├── index.ts
        │   │       └── test.ts
        │   ├── constants/
        │   └── types/
        │
        └── __test__/                    # E2E (보류)
```

도메인 폴더 이름은 아래 중 하나로 통일. 새 도메인이 필요하면 이 목록에 추가.

| 도메인 | 다루는 것 |
| --- | --- |
| `meeting` | 회의 목록·상세·제목·삭제·복사 |
| `utterance` | 발화 텍스트 편집·화자 재배정 |
| `speaker` | 화자 이름 지정·병합 |
| `recording` | 마이크 녹음 시작/정지·레벨 |
| `pipeline` | 처리 진행률·상태·오류 |
| `model` | 모델 존재 확인·다운로드(온보딩) |
| `setting` | 앱 설정 조회·변경 (원본 WAV 보관, 업데이트 확인 등) |
| `update` | 새 버전 알림·다운로드·설치 (Phase 4, 기본 꺼짐) |
| `clipboard` | 시스템 클립보드 쓰기 (api 래퍼 전용 도메인, 컴포넌트 폴더는 만들지 않음) |
| `widget` | 녹음 위젯 패널 표시·숨김 (api 래퍼 전용 도메인. 패널 UI는 `recording/WidgetPanelSection`) |

## 레이어별 역할 (renderer)

### pages

라우트에 대응하는 화면 단위. widgets를 import해 **배치하는 레이아웃 역할만** 담당하며, 도메인 로직·데이터 요청은 갖지 않음. UI 단위가 크지 않은 경우에는 features를 page에서 바로 import 가능.

### modules/widgets

`<section />`으로 분류할 수 있을 만큼 규모가 큰, 화면의 독립적인 구획을 담당. 섹션 단위의 유저 플로우 전체(데이터 요청부터 액션까지)를 책임지는 지휘자. 예: `meeting/MeetingListSection`, `meeting/TranscriptSection`, `recording/RecorderSection`, `model/ModelDownloadSection`.

### modules/features

widgets 안에서 독립적으로 존재할 수 있는, 섹션이 되지 못하는 작은 도메인 단위. 필요한 데이터를 스스로 요청하고 할당받은 작업을 완결. 예: `recording/RecordButton`, `speaker/SpeakerRenameField`, `meeting/CopyTranscriptButton`.

### shared (renderer)

특정 도메인 컴포넌트에 강결합되지 않아 renderer 어디서든 쓸 수 있는 코드. `api`, `components`(primitives / composites), `hooks`(common / domain), `provider`, `routes`, `utils`, `constants`, `types`.

## Context / Provider / Routes

- `createContext`, `useContext`, `Provider` 세 가지는 파편화를 막기 위해 한 파일 안에 함께 작성.
- 전역 컨텍스트(테마, 설정, 토스트)는 `shared/provider`에서 관리.
- 특정 컴포넌트에서만 쓰이는 컨텍스트(컴파운드 패턴, prop drilling 제거용)는 `shared/provider`가 아니라 해당 컴포넌트 폴더의 `context` 세그먼트에 코로케이션 (`context/{이름}Context.tsx`).
- 라우트는 `shared/routes`에서 라우터 정의·path 상수·가드·리다이렉트를 함께 관리. 메모리/해시 라우터를 쓰므로 path 상수는 여기서만 참조.

## 네이밍 규칙 (폴더 구조 관점)

- renderer: 폴더명은 구현체 이름, 구현체 파일은 `index.ts(x)` (`Button/index.tsx`, `useRecorder/index.ts`). 코로케이션과 함께 변경에 유연함을 열어두기 위한 선택.
- **컴포넌트 세그먼트(`ui`/`model`/`utils`/`types`/`constants`/`context`) 내부는 예외**: 폴더 + `index.ts`를 다시 쓰지 않고 구현체 이름의 플랫 파일 (`ui/UtteranceRow.tsx`, `model/useTranscript.ts`).
- `src/shared`, `src/main`, `src/preload`는 폴더 + `index.ts` 방식을 쓰지 않고 역할별 플랫 파일. React 레이어 규칙(widgets/features 등)도 적용하지 않음.
- 케밥 케이스 금지. 카멜(파스칼 포함)로 통일.
- 테스트 파일은 "인덱스 제외 나머지는 폴더" 규칙의 예외 (`test.ts`, `test.tsx`, `*.test.ts`).
