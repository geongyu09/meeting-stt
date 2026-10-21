# 아키텍처: 프로세스 경계, 디렉터리, IPC

이 문서는 **데스크탑 앱(`apps/desktop`)** 내부를 다룬다. 아래 `src/…`, `scripts/…`, `resources/…`는 모두 `apps/desktop/` 기준이고, 워크스페이스 경계와 공용 패키지는 `references/monorepo.md`에 있다.

## 기능별 설계 문서

기능별 설계는 `references/features/*.md`로 나눴다 (2026-10-21, 한 파일 2,276줄이 한 번에 읽히지 않아서). 이 문서에는 모든 기능이 따르는 공통 구조만 남는다.
다른 문서·코드 주석의 `references/architecture.md "<절 이름>"` 링크는 아래 표에서 절 이름으로 파일을 찾는다. 새로 쓰는 링크는 기능 파일을 직접 가리킨다.

| 파일 | 절 | 하위 절 |
| --- | --- | --- |
| `features/assistant.md` | 개인 비서 모드 (Phase 6, 2026-10-20) | 이슈의 "정할 것" — 1차 결정 (2026-10-20, 사용자 확인 대기) · 작업 폴더 (`src/main/assistant/folder.ts`) · 에이전트 실행 경로 (요약 경로와 분리) · 대화 상태 (`src/main/assistant/session.ts`) · 문서 에디터 (`src/main/assistant/files.ts`) · IPC · 화면 · 빠른 질문 모드 (후순위, 미착수) |
| `features/assistant.md` | 기본 하네스 (2026-10-22) | 넣는 것과 빼는 것 · 폴더 구조 · 스킬 · 넣는 시점과 방법 (`src/main/assistant/harness.ts`) · IPC와 화면 · 검증 |
| `features/assistant.md` | 녹음 기록 자동 정리 (2026-10-21) | 흐름 · 녹음 종류 (회의 / 메모) · 원문 파일 (`src/main/assistant/recordNote.ts`) · 정리 에이전트 (`src/main/assistant/organize.ts`) · 알림 (`src/main/windows/notify.ts`) · IPC · 화면 |
| `features/assistant.md` | 루틴 (2026-10-22) | 루틴과 저장 (`src/shared/routine.ts`, 순수 함수 + vitest) · 다음 실행 계산 · 스케줄러와 실행 (`src/main/assistant/routines.ts`) · 알림 (`src/main/windows/notify.ts`) · IPC · 화면 (`setting/RoutineSection`) |
| `features/recording.md` | 녹음본 재생·내보내기·다시 인식 (2026-09-25) |  |
| `features/recording.md` | 녹음 파일 관리 (2026-10-21) |  |
| `features/recording.md` | 녹음 파일 가져오기 (2026-09-25) |  |
| `features/recording.md` | 녹음 (renderer) | 마이크 입력 장치와 테스트 (2026-09-25) |
| `features/recording.md` | 녹음 위젯 패널 (Phase 5-3) | macOS WidgetKit 위젯을 만들지 않는 이유 · 창 속성과 배치 · 라우트와 창 구성 · 녹음 상태의 단일 출처 · 일시정지·재개 (2026-09-26) · 메뉴바 (Tray) · 전역 단축키 · 설정 |
| `features/recording.md` | 시스템 오디오 캡처 (Phase 5-2, 2026-09-26) | 방식: Core Audio Taps + 동봉 Swift 도구 · 도구 규약 (`systemAudioTap`) · main: 섞기는 세션 안에서, 파이프라인은 그대로 · 화면 |
| `features/recording.md` | 녹음 품질 안내 (2026-10-02) | 지표와 판정 (`src/shared/audioQuality.ts`, 순수 함수 + vitest) · 녹음 중 안내 (`src/main/audio/qualityMonitor.ts`) · 사후 표시 |
| `features/recording.md` | 녹음 노트 (2026-10-21) | 저장과 단일 출처 · 쓰이는 곳 · 화면 · IPC |
| `features/dictation.md` | 라이브 받아쓰기 (2026-09-26) | 엔진: 기존 whisper-cli를 짧은 구간마다 다시 돌린다 · 구간 나누기 (`src/main/audio/liveWindow.ts`, 순수 함수 + vitest) · 인식 한 번 (`src/main/audio/liveTranscript.ts`) · 상태와 IPC · 화면 |
| `features/dictation.md` | 받아쓰기 (2026-10-11) | 문제와 목표 · 네 가지 결정 (2026-10-11 사용자) · 흐름 · 세션과 상태 (`src/main/dictation/session.ts`) · 구간 나누기와 인식 · 다듬기 (`packages/core/src/dictation.ts`, 순수 함수 + vitest) · 끼워 넣기 (`src/main/dictation/insert.ts` + `native/textInsert/main.swift`) · 패널·메뉴바·단축키·설정 · 자원 · 측정 (`docs/dictation-results.md`) |
| `features/transcript.md` | 화자 재군집 (2026-09-25) |  |
| `features/transcript.md` | 용어 사전 (Phase 5-4) | 초안은 LLM, 확정은 사람 · 실행과 큐 · IPC · 화면 |
| `features/transcript.md` | 인식 단계 용어 프롬프트 (2026-10-01) | 인자 · 토큰 수 세기와 예산 · 범위 · 교정 횟수로 용어 자동 등록 (2026-10-19) |
| `features/transcript.md` | 회의록 교정 (Phase 5-4) | 실행과 큐 · 문장 교정 (외부 공급자, 2026-09-28) · 결과 기록 · IPC · 화면 |
| `features/transcript.md` | 회의록 자동 제목 (2026-10-21) | 실행과 큐 · 입력과 출력 (`src/shared/autoTitle.ts`, 순수 함수 + vitest) · 기본 제목 판정 · 화면 |
| `features/llm.md` | 로컬 LLM 요약 (Phase 5) | 잡 큐 통합 · IPC (Phase 5) · 화면 · 바이너리·모델 확보 (Phase 5) |
| `features/llm.md` | 요약 템플릿 (2026-09-29) | 블록 모델 · 컴파일 · 제약 (저장 시 main이 검증, 어기면 거절) · 저장·IPC · 화면 |
| `features/llm.md` | LLM 공급자 (2026-09-24) | 다섯 공급자 · 파일과 인터페이스 · Claude Code CLI 호출 · Codex CLI 호출 (2026-09-29) · Claude API 호출 · OpenAI API 호출 · IPC · 화면 |
| `features/ui.md` | UI 언어 (2026-09-25) | 사전과 타입 · renderer · main · 범위 밖 |
| `features/ui.md` | 피드백 보내기 (2026-09-28) |  |
| `features/ui.md` | 화면 디자인 (UI 리디자인, 2026-09-24) | 디자인 토큰 (`packages/design/src/base.css`) · 다크 모드 (2026-09-28) · 공통 컴포넌트 (`shared/components/primitives/ui`) · 글꼴 동봉 · 메인 창과 사이드바 레이아웃 · 화면별 구성 · 회의록 검색 (`meetings:search`) |
| `features/ui.md` | 채팅창 리뉴얼 (2026-10-21 시안) | 토큰 · 라우트 · 홈 (빈 대화) · 입력 도크 (composer) · 대화 · 문서 패널 (대화 옆) · IPC |
| `features/ui.md` | 화면 라우트 (Phase 2) |  |
| `features/ui.md` | 편집 UI 규칙 (Phase 3) |  |

## 프로세스 경계

```
┌────────── renderer: 메인 창 (Chromium, React) ─────────────┐
│ 페이지: Onboarding / Home / Record / MeetingDetail / Settings │
│ 녹음은 직접 하지 않는다 — 명령을 보내고                     │
│ recording:state 이벤트로 상태를 구독만 한다                 │
│ 나머지는 window.api.* 호출 + 진행률 이벤트 구독             │
└───────────────────────────┬────────────────────────────────┘
┌────────── renderer: 위젯 패널 (#/widget, Phase 5-3) ───────┐
│ 오디오 그래프의 유일한 소유자                               │
│ 녹음: getUserMedia → AudioContext(16kHz) → AudioWorklet    │
│       → Float32 PCM 청크를 IPC로 main에 전달               │
└───────────────────────────┬────────────────────────────────┘
                            │ contextBridge (preload, 타입 고정)
┌───────────────────────────┴──── main (Node) ───────────────┐
│ audio/   PCM 청크 → WAV 파일 append, 종료 시 헤더 확정      │
│          녹음 세션 상태(진행 중 회의·시작 시각·참석자 수) 보유 │
│ windows/ 메인 창·위젯 패널 생성과 배치, Tray, 전역 단축키    │
│ pipeline/ 잡 큐(순차) → normalize → whisper(VAD 내장) → diarize → merge │
│ db/      better-sqlite3, 마이그레이션, 리포지토리           │
│ models/  모델 경로 해석, 다운로드(Range/체크섬), 존재 확인   │
│ bin/     플랫폼별 바이너리 경로 해석, spawn 래퍼            │
│ ipc/     handle 등록, 진행률·녹음 상태 send                 │
└────────────────────────────────────────────────────────────┘
```

- 파이프라인 실행은 UI 스레드와 분리한다. 1차는 main에서 `child_process.spawn`(비동기라 이벤트 루프를 막지 않음)으로 충분하며, 병합 로직이 무거워지면 `utilityProcess`로 옮긴다.
- renderer에서는 `fs`, `child_process`, `better-sqlite3`를 절대 import하지 않는다 (스캐폴드가 `sandbox: false`라도 규칙으로 금지).

## 디렉터리 배치 (목표)

워크스페이스 전체는 이렇게 생겼다 (`references/monorepo.md`).

```
apps/desktop/                 # 제품 Electron 앱 (패키지 이름 meeting-stt) — 아래 상세
apps/web/                     # 브라우저 추론 프로토타입 (docs/browser-prototype-plan.md)
packages/core/src/            # 순수 공용 로직 — types, merge, format, normalize(공식), speakerCount, audio
packages/models/src/          # 모델 카탈로그 — desktop.ts(동봉·다운로드 자산), web.ts(HF 저장소 id·dtype)
```

데스크탑 앱 내부:

```
scripts/                      # Phase 1 검증 스크립트 (`pnpm --filter meeting-stt exec tsx scripts/<name>.ts`)
  pipeline.ts                 # wav → normalize → whisper → diarize → merge → 콘솔/JSON 출력
  fixtures/                   # 테스트용 한국어 회의 WAV (git 제외)
resources/
  bin/darwin-arm64/whisper-cli, sherpa-onnx-offline-speaker-diarization, llama-cli (+ dylib)
src/
  shared/                     # 이 앱의 두 프로세스가 함께 쓰는 순수 TS (공용 로직은 @meeting-stt/core에 있다)
    types.ts                  # Meeting, MeetingDetail, Utterance, Speaker, AppSettings (+ core의 파이프라인 타입 재노출)
    ipc.ts                    # 채널 상수 + 요청/응답/이벤트 payload 타입
    audio.ts                  # 녹음 청크 크기·레벨 미터 (형식 상수 SAMPLE_RATE_HZ 등은 core에서 재노출)
    progress.ts               # 단계별 퍼센트 → 전체 진행률 (가중치, 순수 함수, vitest)
    summary.ts                # 요약 프롬프트·청킹 (Phase 5, 순수 함수)
    glossary.ts, refine.ts, phonetic.ts   # 용어 사전 초안·정리, 교정 후보·판정 프롬프트·쌍 적용·쌍 묶기, 자모 발음 유사도 (Phase 5-4, 순수 함수)
    llm.ts                    # LLM 공급자 라벨·준비 판정·CLI 인자 (순수 함수)
  main/
    index.ts                  # 앱 수명주기, 권한 요청, ipc 등록
    log.ts                    # 운영 로그 (console 직접 호출 금지)
    windows/{main,widget,tray,shortcuts}.ts   # 메인 창·위젯 패널·메뉴바·전역 단축키 (Phase 5-3)
    audio/{session,wavWriter,recordings}.ts   # 녹음 세션 상태·WAV append·파일 정리
    pipeline/{queue,run,normalize,whisper,diarize}.ts   # normalize는 RMS 게인 정규화(공식·상수는 @meeting-stt/core), vad는 whisper 내장이라 별도 단계 없음
    pipeline/{recluster,speakerEmbedding,embedWorker}.ts   # 화자 재군집 — CLI 구간 재임베딩(sherpa-onnx-node, utilityProcess) + k-means(@meeting-stt/core/cluster) (2026-09-25)
    types/sherpaOnnxNode.d.ts # sherpa-onnx-node에 타입 선언이 없어 쓰는 부분만 선언
    db/{connection,migrations,meetings,utterances,speakers,settings,refine}.ts   # refine은 자동 교정 결과 컬럼(refine_applied·refined_at) (Phase 5-4)
    models/{paths,download,recommend,service}.ts   # 경로 해석·다운로드·저사양 권장 (자산 목록은 @meeting-stt/models/desktop)
    summary/{llama,run,paths,transcript}.ts        # 요약 (Phase 5). LLM 호출은 llm/*을 거친다
    glossary/draft.ts, refine/{run,paths}.ts       # 용어 초안·회의록 자동 교정 (Phase 5-4). LLM 호출은 llm/*을 거친다
    llm/{provider,local,claudeApi,claudeCli,codexCli,cliEnv,openaiApi,apiKey,check}.ts  # LLM 공급자 추상화 (`references/features/llm.md` "LLM 공급자" 절)
    assistant/{folder,files,session,claudeAgent,claudeStream,workspacePath,harness}.ts  # 개인 비서 — 작업 폴더·문서 읽기/쓰기·감시·에이전트 대화·기본 하네스(템플릿은 assistant/harness/) (Phase 6, `references/features/assistant.md` "개인 비서 모드" 절)
    updater.ts                # electron-updater, 기본 꺼짐 (references/distribution.md)
    bin/{paths,spawn}.ts
    ipc/handlers.ts, ipc/assistant.ts   # assistant.ts는 개인 비서 채널 (handlers.ts가 400줄을 넘어 나눴다)
  preload/index.ts            # window.api 타입 노출
  renderer/src/
    main.tsx, App.tsx
    assets/{main.css,layout.css}   # 진입 CSS(@meeting-stt/design의 fonts.css·base.css를 import)·데스크탑 레이아웃 치수 (`references/features/ui.md` "화면 디자인" 절)
    worklet/pcmRecorder.js    # AudioWorkletProcessor (Vite `?url` import로 로드)
    pages/{Onboarding,Home,Record,MeetingDetail,Settings,Widget,Assistant}/index.tsx   # widgets 배치만
    shared/routes/{index.tsx,paths.ts,guards.tsx,layout.tsx}   # 라우터·경로 상수·온보딩 진입 가드·메인 창 레이아웃(정지 후 상세 이동)
    modules/widgets/{domain}/…    # section 단위 도메인 컴포넌트 (TranscriptSection, SettingsSection 등)
    modules/features/{domain}/…   # 작은 도메인 컴포넌트 (PipelineProgress 등)
    shared/api/{domain}/index.ts  # window.api 래퍼 (유일한 window.api 접점)
    shared/components/{primitives,composites}/…
    shared/hooks/{common,domain}/…   # useRecorder(위젯 전용), useRecordingState, useMeetings, usePipelineProgress
    shared/{provider,routes,utils,constants,types}/
    # 레이어·콜로케이션·세그먼트·훅 위치 규칙은 .claude/rules/*.md 를 따른다
```

## IPC 규약

`src/shared/ipc.ts` 한 곳에서 채널과 타입을 정의하고 양쪽이 import한다.

```ts
export const IPC = {
  // Phase 2
  recording: {
    requestPermission: 'recording:requestPermission',
    start: 'recording:start',
    chunk: 'recording:chunk',
    stop: 'recording:stop'
  },
  meetings:  { list: 'meetings:list', get: 'meetings:get' },
  events:    { progress: 'pipeline:progress' },
  // Phase 3
  //   meetings.rename / meetings.delete
  //   utterances.updateText / utterances.reassign
  //   speakers.rename / speakers.merge
  //   settings.get / settings.update
  //   clipboard.writeText
  // Phase 4 (references/distribution.md 3·7절)
  //   models.status / models.download / models.downloadSummary / models.remove, events.modelDownload
  //   events.modelsChanged (다운로드가 끝나면 모든 창이 모델 상태를 다시 읽는다 — distribution.md 3절)
  //   update.check / update.download / update.install, events.updateAvailable
  // Phase 5
  //   summary.create, events.summary
  //   glossary.get / glossary.update / glossary.draft (Phase 5-4, `references/features/transcript.md` "용어 사전" 절)
  //   refine.run, events.refine (Phase 5-4, `references/features/transcript.md` "회의록 교정" 절 — 파이프라인 뒤 자동 실행, run은 수동 재실행)
  // Phase 5-3 (`references/features/recording.md` "녹음 위젯 패널" 절)
  //   recording.state / recording.control / recording.setSpeakerCount / recording.reportError
  //   events.recordingState / events.recordingCommand
  //   widget.setVisible
  //   shortcuts.setSuspended (단축키 설정, `references/features/recording.md` "전역 단축키" 절)
  // UI 리디자인 (`references/features/ui.md` "화면 디자인" 절)
  //   meetings.search, events.meetingsChanged
  // 녹음본 재생·내보내기·다시 인식 (아래 같은 이름의 절)
  //   meetings.reprocess / meetings.exportAudio (재생은 IPC가 아니라 meeting-audio:// 프로토콜)
  // 녹음 파일 관리 (아래 같은 이름의 절, 2026-10-21)
  //   meetings.listAudio / meetings.deleteAudio
  // 녹음 파일 가져오기 (아래 같은 이름의 절)
  //   meetings.import
  // LLM 공급자 선택 (`references/features/llm.md` "LLM 공급자" 절)
  //   llm.status / llm.setProvider / llm.setApiKey / llm.setOpenaiModel / llm.setCodexModel / llm.check
  // 라이브 받아쓰기 (아래 같은 이름의 절)
  //   recording.setLiveTranscript (결과는 events.recordingState의 liveTranscript로 push)
  //   recording.setSystemAudio (결과는 events.recordingState의 systemAudio로 push, Phase 5-2)
  // 녹음 일시정지 (`references/features/recording.md` "녹음 위젯 패널" > "일시정지·재개" 절)
  //   recording.setPaused (결과는 events.recordingState의 pausedAt으로 push)
  // 피드백 보내기 (아래 같은 이름의 절)
  //   feedback.open
  // 요약 템플릿 (아래 같은 이름의 절)
  //   summaryTemplates.list / summaryTemplates.save / summaryTemplates.delete (summary.create에 templateId 추가)
  // 받아쓰기 (아래 같은 이름의 절, 2026-10-11)
  //   dictation.state / dictation.control / dictation.start / dictation.chunk / dictation.stop / dictation.reportError
  //   dictation.openAccessibilitySettings / events.dictationState / events.dictationCommand
  // 개인 비서 모드 (Phase 6, 아래 같은 이름의 절)
  //   assistant.status / assistant.chooseFolder / assistant.setPermissionMode / assistant.setProvider
  //   assistant.state / assistant.send / assistant.cancel / assistant.reset
  //   assistant.listFiles / assistant.readFile / assistant.writeFile
  //   events.assistantState / events.assistantFilesChanged
} as const
```

**Phase 5-3의 채널 문자열은 아래와 같이 고정한다.** 조회(invoke)와 push 이벤트가 같은 개념을 다루지만
채널 이름은 겹칠 수 없어 이벤트 쪽에 `Changed`를 붙인다.

| 키 | 채널 | 방향 | 용도 |
| --- | --- | --- | --- |
| `recording.state` | `recording:state` | invoke | 지금 녹음 중인지 조회. 늦게 열린 창이 현재 상태를 안다 |
| `recording.control` | `recording:control` | invoke | 메인 창이 보내는 시작/정지 요청. main이 위젯에 `recording:command`로 넘긴다 |
| `recording.setSpeakerCount` | `recording:setSpeakerCount` | invoke | 두 창의 참석자 수 입력을 main 세션에 모은다 |
| `recording.reportError` | `recording:reportError` | invoke | 위젯에서만 알 수 있는 실패(마이크 권한·그래프 생성)를 세션에 기록 |
| `widget.setVisible` | `widget:setVisible` | invoke | 패널의 숨기기 버튼 |
| `shortcuts.setSuspended` | `shortcuts:setSuspended` | invoke | 설정 화면에서 단축키를 입력받는 동안 전역 단축키를 잠시 해제·복구 |
| `events.recordingState` | `recording:stateChanged` | push | 녹음 상태 브로드캐스트 |
| `events.recordingCommand` | `recording:command` | push | main → 위젯 지시 (전역 단축키·Tray·메인 창) |
| `recording.setLiveTranscript` | `recording:setLiveTranscript` | invoke | 녹음 화면의 파형 ↔ 라이브 받아쓰기 보기 전환 (2026-09-26, `references/features/dictation.md` "라이브 받아쓰기" 절) |
| `recording.setSystemAudio` | `recording:setSystemAudio` | invoke | 온라인 회의 소리(스피커 출력) 함께 녹음 켜기/끄기. 켜면 도구를 1초 돌려 권한 창을 띄운다 (Phase 5-2, `references/features/recording.md` "시스템 오디오 캡처" 절) |
| `recording.setPaused` | `recording:setPaused` | invoke | 녹음 일시정지·재개 (2026-09-26, `references/features/recording.md` "일시정지·재개" 절) |
| `dictation.state` | `dictation:state` | invoke | 받아쓰기 상태 조회. 늦게 열린 창이 현재 상태를 안다 (2026-10-11, `references/features/dictation.md` "받아쓰기" 절) |
| `dictation.control` | `dictation:control` | invoke | 패널의 중지 버튼·메인 창이 보내는 시작/정지 요청. main이 위젯에 `dictation:command`로 넘긴다 |
| `dictation.start` / `dictation.chunk` / `dictation.stop` | `dictation:start` / `dictation:chunk` / `dictation:stop` | invoke | 위젯(그래프 소유자)이 그래프를 만든 뒤 시작을 알리고 청크를 보내고 끝낸다. `recording:*`와 같은 모양이지만 WAV·회의 행을 만들지 않는다 |
| `dictation.reportError` | `dictation:reportError` | invoke | 위젯에서만 알 수 있는 실패(마이크 권한·그래프 생성)를 받아쓰기 상태에 기록 |
| `dictation.openAccessibilitySettings` | `dictation:openAccessibilitySettings` | invoke | 설정 "받아쓰기" 카테고리의 "시스템 설정 열기" — 개인정보 보호 및 보안 → 손쉬운 사용 화면을 연다 |
| `events.dictationState` | `dictation:stateChanged` | push | 받아쓰기 상태 브로드캐스트 (`DictationStateEvent`) |
| `events.dictationCommand` | `dictation:command` | push | main → 위젯 지시 (`{ kind: 'start' \| 'stop' }`, 전역 단축키·Tray·패널 버튼) |

### 편집 채널의 응답 규약 (Phase 3)

**회의 상세를 바꾸는 모든 뮤테이션 채널은 갱신된 `MeetingDetail`을 그대로 돌려준다** (`meetings:get`과 같은 모양).
`meetings:delete`만 예외로 아무것도 돌려주지 않는다 — 지운 회의의 상세가 없기 때문이다.

- 이유: 화자 병합·재배정처럼 여러 행이 한꺼번에 바뀌는 작업도 renderer가 응답 하나로 상태를 정확히 맞출 수 있다.
  뮤테이션마다 "무엇이 바뀌었는지" 부분 응답을 설계하거나, 뮤테이션 뒤에 `meetings:get`을 한 번 더 부르는 왕복을 만들지 않는다.
- renderer는 응답을 `useMeeting`의 상세 상태에 그대로 덮어쓴다. 낙관적 업데이트는 하지 않는다 (로컬 SQLite라 왕복이 짧다).
- 요청 payload에는 대상 식별자와 함께 `meetingId`를 항상 넣는다. 응답을 만들 때 회의를 다시 찾지 않아도 되고, 핸들러가 "이 회의의 발화/화자인지"를 검증할 수 있다.

- `clipboard:writeText`는 main의 `electron.clipboard`로 텍스트를 복사한다. renderer의 `navigator.clipboard`를 쓰지 않는다 —
  패키징 빌드의 `file://` 문서와 `setPermissionRequestHandler`(마이크 외 전부 거부)에 걸릴 여지를 없애기 위해서다. 복사할 텍스트 조립은 renderer가 `@meeting-stt/core/format`으로 한다.

- 채널은 **그 Phase에서 실제로 쓰는 것만** 정의한다. 쓰지 않는 채널을 미리 선언해 두면 preload·renderer 래퍼까지 죽은 코드가 따라온다.
- `recording:requestPermission`은 마이크 권한 요청·확인 채널이다. renderer가 `getUserMedia`를 부르기 **전에** 호출하고,
  main이 `systemPreferences.askForMediaAccess('microphone')`(macOS) 결과를 돌려준다. 다른 플랫폼은 항상 허용으로 응답하고 실패는 `getUserMedia`에서 처리한다.
- `recording:chunk`도 `invoke`로 보낸다. `send`는 백프레셔가 없어 디스크 쓰기가 밀릴 때 큐가 무한정 쌓인다.

- 요청-응답: `ipcMain.handle(channel, (e, payload) => …)` ↔ `ipcRenderer.invoke`.
- 진행률/상태 push: main → `win.webContents.send(IPC.events.progress, { meetingId, stage, percent })`.
- preload는 채널별 함수를 `window.api`로 노출 (`api.meetings.list()` 등). `ipcRenderer` 객체 자체를 노출하지 않는다.
- PCM 청크 전송은 `ArrayBuffer`/`Uint8Array`로 보내고 main에서 즉시 파일에 append한다 (메모리 누적 금지).

## 외부 바이너리·모델 확보 (커밋하지 않는다)

`whisper-cli`, `sherpa-onnx-offline-speaker-diarization` 같은 실행 파일과 `*.bin`/`*.onnx` 모델은
용량이 크고 재현 가능하므로 **git에 커밋하지 않는다**(`.gitignore`에 `resources/bin/`, `*.bin`, `*.onnx`).
대신 셋업 스크립트로 내려받아 배치한다.

| 스크립트 | 하는 일 | 배치 위치 |
| --- | --- | --- |
| `pnpm setup:bin` | 현재 플랫폼용 실행 파일 확보(다운로드 또는 로컬 설치본 복사), 실행 권한 부여, macOS 격리 속성 제거 | `resources/bin/<platform>-<arch>/` |
| `pnpm setup:models` | Whisper·diarization 모델 다운로드(Range 이어받기, SHA256 검증) | `scripts/fixtures/models/` (Phase 1 전용) |

- Phase 1 스크립트는 위 두 경로를 상수로 참조한다. 앱 런타임의 모델 경로는 `app.getPath('userData')/models`로 별개이며,
  Phase 4 온보딩 다운로더가 `scripts/setupModels.ts`와 같은 카탈로그(`@meeting-stt/models/desktop`)를 공유한다.
- 패키징·CI는 `electron-builder` 실행 **전에** `setupBin.ts`를 돌려 `resources/bin/`을 채운다. 비어 있으면 빌드를 중단한다.
- macOS에서 Homebrew 등 시스템에 이미 설치된 실행 파일이 있으면 복사해 쓸 수 있다. 단 동적 링크된 dylib에 의존하므로
  **배포용으로는 정적/동봉 빌드를 따로 확보**해야 한다(Phase 4). Phase 1 검증에는 시스템 설치본 복사로 충분하다.

## 외부 바이너리 실행

```ts
// src/main/bin/spawn.ts (개념)
spawn(binPath, args, { windowsHide: true })
  .stdout → 라인 단위 파싱 (whisper: --print-progress로 진행률, --output-json으로 결과 파일)
  .stderr → 로그 보관, 실패 시 사용자 안내 메시지에 포함
  exit code ≠ 0 또는 JSON 파싱 실패 → meetings.status = 'error', error_message 저장
```

- 바이너리 경로: 개발 시 `resources/bin/...`, 패키징 시 `process.resourcesPath` 아래 `app.asar.unpacked/resources/bin/...`. 경로 해석은 `src/main/bin/paths.ts`에서만 한다.
- whisper 호출 예: `whisper-cli -m <model> -f <wav> -l ko -mc 0 --output-json-full -of <out> --print-progress` (+ 단어 타임스탬프 옵션, VAD 옵션은 Phase 1 튜닝 결과 반영). 전역 용어 사전이 있으면 `-mc 0` 대신 `--prompt <용어> --carry-initial-prompt -mc <프롬프트 토큰 수 + 1>` (`references/features/transcript.md` "인식 단계 용어 프롬프트").
- diarization 호출 파라미터: **항상 `--clustering.num-clusters=<참석자 수, 모르면 12>`** 로 돌린다(참석자 수는 녹음 정지 시 사용자가 입력, `meetings.speaker_count`). 2026-09-25부터 CLI의 화자 라벨은 쓰지 않고 구간 경계만 쓴다 — 군집은 `references/features/transcript.md` "화자 재군집"이 다시 한다. 임계값(`--clustering.cluster-threshold`)은 스크립트 실험용으로만 남긴다(임계값 군집은 녹음 길이에 비례해 화자가 늘어난다, `docs/phase1-results.md` 6절). 참석자 수를 모를 때 12를 주는 이유는 임계값보다 구간이 덜 잘게 쪼개져 재임베딩 조각이 길어지고, 재군집이 실패했을 때의 폴백 결과도 32명보다 낫기 때문이다. 최소 지속 시간은 기본값 유지. 프로바이더는 CPU 고정(`coreml`은 훨씬 느림).
- **분할 창 간격**: `--segmentation.pyannote-window-shift-ratio=0.25`(`DIARIZE_WINDOW_SHIFT_RATIO`, 10초 창을 2.5초씩 이동). CLI 기본 0.1(1초)은 창을 열 겹으로 겹쳐 임베딩을 뽑는데(103분 회의 8,231개), 그 임베딩과 라벨은 재군집이 버린다. 0.25로 넓히면 CLI 시간이 약 60% 줄고(103분 회의 819초 → 313초, 3스레드) 한국어 녹음 정확도는 같다. 0.5 이상은 경계가 거칠어져 재배정이 늘어 쓰지 않는다 (2026-10-18 사용자 결정, `docs/diarization-experiments.md` E10). **이 옵션은 오디오 경로보다 앞에 둔다** — CLI가 위치 인자 뒤의 옵션을 거부한다.
- 참석자 수가 있으면 병합 단계의 군소 화자 흡수(`absorbMinorSpeakers`)를 건너뛴다 — K개로 자른 클러스터는 전부 실제 화자로 보고, 짧게 한 마디 한 참석자를 지우지 않기 위해서다. 참석자 수가 없으면 과분할(K=12)에서 병합 보호로 되돌아오지 못한 몇십 초짜리 여분 클러스터가 남을 수 있어 흡수를 적용한다.
- 참석자 수를 실제보다 크게 넣어도 sherpa-onnx는 실패하지 않고 **K개 이하**로 나눈다(합성 3화자 115초에 `num-clusters=10` → 7개, 5초 녹음에 3 → 2개). 재군집의 k-means도 조각 수가 K보다 적으면 조각 수로 줄인다. 그래도 남는 과분할은 Phase 3의 화자 병합 UI로 고칠 수 있으므로 main에서 따로 막지 않는다.
- 음량 정규화: whisper·diarization을 spawn하기 **전에** `src/main/pipeline/normalize.ts`가 녹음 WAV의 PCM에 RMS 게인을 적용한 WAV를 만들고, 두 바이너리는 그 파일을 읽는다. 원본은 정규화본과 별개로 두며 삭제 정책은 원본에만 적용된다. 파라미터는 SKILL.md 결정 표 참고.

## 가속·스레드 정책

대상은 Apple Silicon 하나뿐이므로 플랫폼 분기를 두지 않는다.

**GPU는 이미 쓰고 있다.** whisper.cpp는 Metal 백엔드가 기본으로 켜져 있고(`-ng`로 꺼야 CPU로 떨어진다),
llama.cpp도 `-ngl` 없이 전 레이어를 Metal에 올린다(`load_tensors: offloaded 37/37 layers to GPU`).
CPU만 쓰는 것은 sherpa-onnx 화자 분리뿐이다 — `coreml` 프로바이더가 CPU보다 훨씬 느려 CPU로 고정했다.

**문제는 스레드 수였다.** 셋 다 `os.cpus().length - 2`를 받고 있었는데, `os.cpus()`는 성능 코어와 효율 코어를
구분하지 않는다. M3 Pro(P6+E6)에서 10을 주면 효율 코어까지 잡아 **느려지면서 발열만 는다.**

측정: 120초 16kHz mono WAV, M3 Pro, 2026-08-26.

| 대상 | 설정 | 실행 시간 | CPU |
| --- | --- | --- | --- |
| whisper (turbo-q5, VAD 켬) | `-t 10` | 6.11초 | 44% |
| whisper | `-t 4` | 6.11초 | 42% |
| whisper | `-t 4 -ng` (GPU 끔) | 20.7초 | 294% |
| 화자 분리 | `-t 10` | 18.2초 | 915% |
| 화자 분리 | `-t 6` | **10.8초** | 593% |
| 화자 분리 | `-t 4` | 13.8초 | 397% |
| 요약 (Qwen3-4B-Q4_K_M, 4K 프롬프트·128토큰) | `-t 10` | 12.5초 (CPU 8.7초) | — |
| 요약 | `-t 4` | 10.6초 (CPU 3.3초) | — |
| 요약 | `-t 2` | 10.6초 (CPU 1.5초) | — |

읽는 법:

- **whisper는 스레드에 반응하지 않는다.** GPU가 일하고 CPU는 40%대에 머문다. 낮게 줘도 손해가 없고,
  화자 분리와 병렬로 돌 때 코어 경합만 줄어든다.
- **화자 분리가 유일한 열원이다.** 성능 코어 수(6)를 넘기면 그 순간부터 느려진다.
- **요약도 GPU 추론이라 스레드는 Metal 커맨드 버퍼 인코딩·스핀 대기에만 쓰인다.** `-t 2`와 `-t 4`가 같은 속도인데
  CPU 시간은 두 배 차이다.

파이프라인의 병렬 구간(STT + 화자 분리 동시 실행)을 같은 WAV로 전후 비교한 결과:

| 설정 | 실행 시간 | CPU | 누적 CPU 시간 |
| --- | --- | --- | --- |
| 이전 (`-t 10` / `-t 10`) | 18.0초 | 979% | 174.7초 |
| 현재 (`-t 4` / `-t 6`) | **13.9초** | 608% | **82.9초** |

정책 (`src/main/bin/threads.ts`가 단독으로 정한다):

| 대상 | 스레드 | 이유 |
| --- | --- | --- |
| 화자 분리 (`sherpa-onnx`) | 성능 코어 수 | 실측 최적. 유일하게 CPU로 도는 단계다 |
| STT (`whisper-cli`) | `min(4, 성능 코어 수)` | GPU가 일한다. 더 줘도 같은 속도라 화자 분리에 코어를 양보한다 |
| 요약 (`llama-cli`) | `min(2, 성능 코어 수)` | 같은 속도에 CPU 시간 1/6 |

- 성능 코어 수는 `sysctl -n hw.perflevel0.logicalcpu`로 얻고 프로세스 수명 동안 캐시한다.
  **`execSync`는 쓰지 않는다** — main에서 동기 spawn은 UI를 멈춘다(`references/pitfalls.md`). 비동기로 한 번 부르고 결과를 재사용한다.
  실패하면 `os.cpus().length`의 절반으로 떨어뜨린다 (Apple Silicon은 성능·효율 코어가 대체로 반반이다).
- **QoS를 낮춰 효율 코어로 밀어내지 않는다.** `taskpolicy -b`로 화자 분리를 돌리면 10.8초 → 116.7초로 **10배 느려진다.**
  조용해지는 대신 71분 회의의 화자 분리가 한 시간을 넘기므로 선택지가 아니다.
- STT와 화자 분리의 병렬 분기(`os.cpus().length >= 8`)는 그대로 둔다. whisper가 CPU를 거의 쓰지 않아 겹쳐도 경합이 없다.

### 조용히 처리 (`pipeline.quiet`, 기본 꺼짐)

위 정책은 **가장 빠른** 설정이고, 그 대가로 화자 분리가 녹음 1분당 약 6.5초 동안 성능 코어 전부를 100%로 쓴다.
한 시간짜리 회의면 7분 넘게 풀가동이라 팬이 크게 돈다. 속도보다 소음을 원하는 사용자를 위해 설정 토글을 둔다.
(2026-10-18 창 간격 0.25 적용으로 CLI 시간이 약 60% 줄어, 1분당 약 3초·한 시간에 3분 안팎으로 추정한다. 아래 표는 창 간격 0.1에서 잰 값이고 스레드 수끼리의 비율은 그대로 쓴다.)

측정: 실제 녹음 10분 발췌(`geumtoro-10min-rmsnorm.wav`), `num-clusters=3`, M3 Pro(P6), 실행 사이 45~60초 휴지, 2026-09-18.

| 화자 분리 스레드 | 실행 시간 | CPU | 누적 CPU 시간 |
| --- | --- | --- | --- |
| 6 (기본) | 63.7초 | 583% | 371초 |
| 4 | 74.8초 (+17%) | 389% | 291초 |
| **3 (조용히)** | **91.9초 (+44%)** | **294%** | **270초** |
| 2 | 132.4초 (+108%) | 193% | 256초 |

- 6스레드를 연속 측정에서 처음 돌렸을 때는 77.0초가 나왔다. 앞선 측정의 열이 남아 있던 탓으로 보고, 4 → 6 순서로 다시 잰 값을 표에 적었다.
- **3스레드(성능 코어의 절반)를 고른다.** CPU 부하(발열)가 절반이 되고 시간은 44% 는다. 2스레드는 시간이 두 배가 되는데 누적 CPU 시간은 거의 줄지 않는다(270초 → 256초).

정책 (`src/main/bin/threads.ts`의 `planThreads`가 `isQuiet`를 받아 정한다):

| 대상 | 기본 | 조용히 처리 |
| --- | --- | --- |
| 화자 분리 | 성능 코어 수 | `ceil(성능 코어 수 / 2)` |
| STT | `min(4, 성능 코어 수)` | 같음 (GPU가 일한다) |
| 요약 | `min(2, 성능 코어 수)` | 같음 (요약은 이 설정을 보지 않는다) |
| STT와 화자 분리 | 코어 8개 이상이면 병렬 | **항상 순차** (STT → 화자 분리). GPU와 CPU 발열이 한 방열판에 겹치지 않게 한다 |

STT + 화자 분리 전체(같은 입력, 실행 전 60초 휴지):

| 설정 | 실행 시간 | CPU 평균 (최대) | GPU 평균 | 누적 CPU 시간 |
| --- | --- | --- | --- | --- |
| 기본 (병렬, `-t 4` / `-t 6`) | 69.7초 | 596% (678%) | 38% | 415초 |
| 조용히 처리 (순차, `-t 4` → `-t 3`) | 116.9초 (+68%) | **228% (301%)** | 22% | **266초** |

- 전체 시간은 1.7배가 되고, CPU 평균 부하는 40% 수준·최대 부하는 절반 이하로 내려간다. 한 시간 회의로 환산하면 약 7분 → 약 12분이다.

- 설정은 `queue.ts`가 **잡이 시작할 때** 한 번 읽어 `runPipeline({ isQuiet })`로 넘긴다. `run.ts`는 DB를 모른다. 진행 중인 잡에는 적용되지 않는다.
- 효율 코어로 밀어내는 방식(`taskpolicy -b`)은 여전히 쓰지 않는다 — 10배 느려진다.

### 화자 분리를 GPU(CoreML)로 돌리지 않는 이유

CoreML이 느린 원인은 **임베딩 모델 입력 길이가 호출마다 달라서**다 (2026-09-18 측정).

- 1분 녹음: 구간 분할 CPU 0.9초 / CoreML 1.1초로 비슷하고, 임베딩이 CPU 5.2초 / **CoreML 24.7초**로 병목이다.
- sherpa-onnx는 발화 조각마다 임베딩 모델(ERes2Net, 9.9M 파라미터, 입력 `[N, T, 80]`)을 한 번씩 부르고 `T`가 조각 길이를 따라 바뀐다.
  모델만 onnxruntime 1.30으로 30회 호출하면 길이 고정(5초)일 때 CoreML 86ms / CPU 149ms로 CoreML이 빠르지만,
  1~10초로 바꿔 가며 넣으면 **CoreML 315ms / CPU 137ms**로 뒤집힌다. 새 길이마다 CoreML의 첫 호출 비용(800~900ms)이 반복된다.
- 구간 분할 모델(pyannote)은 LSTM을 CoreML이 지원하지 않아 노드 50개 중 16개만 CoreML로 가고 7조각으로 나뉜다. 다만 이 단계는 1초 남짓이다.
- 입력 길이를 몇 개 크기로 패딩하면 CoreML이 빨라질 여지는 있지만, CLI에 옵션이 없어 sherpa-onnx를 고쳐야 하고
  임베딩이 시간축 평균이라 패딩이 값을 바꾼다. 채택하지 않는다.

## 앱 런타임 경로 (Phase 2)

| 대상 | 개발(`pnpm dev`) | 패키징 |
| --- | --- | --- |
| 바이너리 | `resources/bin/<platform>-<arch>/` | `process.resourcesPath/app.asar.unpacked/resources/bin/<platform>-<arch>/` |
| 모델 | `userData/models/` → 없으면 `scripts/fixtures/models/` 폴백 | `userData/models/` (Phase 4 온보딩이 채운다) |
| 녹음 WAV | `userData/recordings/<meetingId>.wav` | 같음 |
| DB | `userData/meetings.db` | 같음 |

- 경로 해석은 `src/main/bin/paths.ts`·`src/main/models/paths.ts`에서만 한다. 다른 모듈이 `app.getPath`를 직접 부르지 않는다.
- **모델 폴백은 개발 모드 전용이다.** Phase 4 온보딩 다운로더가 붙기 전까지 `pnpm setup:models`로 받아 둔 Phase 1 픽스처 모델을 그대로 쓰기 위한 장치이며, 패키징 빌드에서는 폴백하지 않는다.
- 시작 시 바이너리·모델이 없으면 앱은 뜨되 파이프라인 잡이 `status='error'`로 끝나고, 사용자에게 "모델이 준비되지 않았습니다" 안내를 남긴다.

## 파이프라인 잡 큐 (Phase 2)

- `src/main/pipeline/queue.ts`는 **동시성 1**의 메모리 큐다. 여러 회의를 동시에 돌리지 않는다 (`references/pitfalls.md`).
- 한 잡의 흐름: `status='processing'` → `normalize`(RMS 게인 WAV 생성) → whisper(`stt`) / diarization(`diarize`) → `merge` → `save`(트랜잭션 INSERT) → `status='done'`.
  코어가 8개 미만이면 STT와 화자 분리를 순차 실행한다.
- 정규화본은 원본 옆에 `<meetingId>.wav.norm.wav`로 만들고 whisper·diarization이 그 파일을 읽는다. 잡이 끝나면 **실패해도 지운다** — 원본에서 다시 만들 수 있는 파생물이다.
  정규화에는 별도 `PipelineStage`를 두지 않고 `stt` 0%에 묶는다. 단계를 늘리면 `src/shared/ipc.ts` 계약과 Phase 3 진행률 UI가 함께 바뀌는데, 정규화는 spawn 없이 끝나는 짧은 단계다.
- 실패하면 `status='error'`, `error_message`에 한국어 안내를 남기고 **원본 WAV는 지우지 않는다**(재시도용).
- 잡이 **성공**하면 설정 `audio.keep`(기본 꺼짐)에 따라 원본 WAV를 지우고 `meetings.audio_path`를 `NULL`로 만든다 (Phase 3).
  71분 16kHz mono WAV가 약 136MB라 기본값을 보관으로 두면 디스크가 빠르게 찬다.
  지운 회의는 재생·내보내기·다시 인식을 할 수 없다 — 그래서 실패한 잡에는 이 정책을 적용하지 않는다 (`references/features/recording.md` "녹음본 재생·내보내기·다시 인식").
- 진행률은 각 단계 시작·종료와 whisper/sherpa의 퍼센트 로그를 `pipeline:progress`로 push한다. 마지막에 `stage='done'` 또는 `'error'`를 한 번 보낸다.
  `percent`는 **그 단계 안에서의 퍼센트**다. 여러 단계를 하나의 막대로 합치는 계산은 renderer가 `src/shared/progress.ts`로 한다.
  `diarize`는 CLI(0~90%)와 재임베딩(90~100%)을 한 단계로 묶는다 ("화자 재군집").
- 앱 시작 시 `status`가 `'recording'`·`'processing'`인 채로 남은 회의는 이전 실행이 비정상 종료된 것이므로 `'error'`로 정리한다. (미완료 녹음 복구는 Phase 3)
  같은 시점에 `recordings/`의 파생물(`*.norm.wav`, `*.whisper.json`)도 지운다 — 잡 중간에 앱이 죽으면 `finally`가 돌지 않아 남는다(2026-08-26 관통 검증에서 확인). 원본 `<meetingId>.wav`는 건드리지 않는다.
- **앱 인스턴스는 한 번에 하나만 띄운다.** 두 인스턴스가 같은 `userData/meetings.db`를 공유하면 나중에 뜬 인스턴스의 시작 정리가 먼저 뜬 인스턴스의 처리 중 회의를 `'error'`로 덮어쓴다. 개발 중 `pnpm dev`를 겹쳐 실행하지 않는다 (단일 인스턴스 강제는 Phase 4에서 `app.requestSingleInstanceLock`으로).

## 진행률 표시 (Phase 3)

`PipelineProgressEvent`는 단계 하나의 퍼센트만 싣는다. 사용자에게 보여 줄 **하나의 진행률 막대**는 renderer가 만든다.

- 계산은 `src/shared/progress.ts`의 순수 함수로 두고 vitest로 검증한다. 단계 가중치는
  `stt 0.3 / diarize 0.6 / merge 0.05 / save 0.05` — Phase 1 측정에서 화자 분리가 병목(10분 발췌 기준 STT 35초 / 화자 분리 141초)이기 때문이다 (`docs/phase1-results.md`).
  체감용 근사치이며, 코어 수에 따라 STT·화자 분리가 병렬로 돌기 때문에 경과 시간과 정확히 비례하지는 않는다.
- 전체 퍼센트는 단계별 퍼센트의 가중합이고 **되돌아가지 않는다**(단계별로 최댓값 유지). `merge`·`save`·`done` 이벤트가 오면 그보다 앞선 단계는 100%로 본다 —
  병렬 실행이라 `stt`와 `diarize` 사이에는 순서가 없지만, `merge`는 둘 다 끝나야 시작하기 때문이다.
- 진행률 UI는 `modules/features/pipeline/PipelineProgress` 하나로 두고 홈 목록 카드와 회의 상세가 함께 쓴다.
