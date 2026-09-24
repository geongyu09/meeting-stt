# 아키텍처: 프로세스 경계, 디렉터리, IPC

이 문서는 **데스크탑 앱(`apps/desktop`)** 내부를 다룬다. 아래 `src/…`, `scripts/…`, `resources/…`는 모두 `apps/desktop/` 기준이고, 워크스페이스 경계와 공용 패키지는 `references/monorepo.md`에 있다.

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
  main/
    index.ts                  # 앱 수명주기, 권한 요청, ipc 등록
    log.ts                    # 운영 로그 (console 직접 호출 금지)
    windows/{main,widget,tray,shortcuts}.ts   # 메인 창·위젯 패널·메뉴바·전역 단축키 (Phase 5-3)
    audio/{session,wavWriter,recordings}.ts   # 녹음 세션 상태·WAV append·파일 정리
    pipeline/{queue,run,normalize,whisper,diarize}.ts   # normalize는 RMS 게인 정규화(공식·상수는 @meeting-stt/core), vad는 whisper 내장이라 별도 단계 없음
    db/{connection,migrations,meetings,utterances,speakers,settings}.ts
    models/{paths,download,recommend,service}.ts   # 경로 해석·다운로드·저사양 권장 (자산 목록은 @meeting-stt/models/desktop)
    summary/{llama,run,paths,transcript}.ts        # 로컬 요약 (Phase 5)
    updater.ts                # electron-updater, 기본 꺼짐 (references/distribution.md)
    bin/{paths,spawn}.ts
    ipc/handlers.ts
  preload/index.ts            # window.api 타입 노출
  renderer/src/
    main.tsx, App.tsx
    assets/{main.css,layout.css}   # 진입 CSS(@meeting-stt/design의 fonts.css·base.css를 import)·데스크탑 레이아웃 치수 (아래 "화면 디자인" 절)
    worklet/pcmRecorder.js    # AudioWorkletProcessor (Vite `?url` import로 로드)
    pages/{Onboarding,Home,Record,MeetingDetail,Settings,Widget}/index.tsx   # widgets 배치만
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
  //   models.status / models.download / models.downloadSummary, events.modelDownload
  //   update.check / update.download / update.install, events.updateAvailable
  // Phase 5
  //   summary.create, events.summary
  //   glossary.get / glossary.update / glossary.draft (Phase 5-4, 아래 "용어 사전" 절)
  // Phase 5-3 (아래 "녹음 위젯 패널" 절)
  //   recording.state / recording.control / recording.setSpeakerCount / recording.reportError
  //   events.recordingState / events.recordingCommand
  //   widget.setVisible
  //   shortcuts.setSuspended (단축키 설정, 아래 "전역 단축키" 절)
  // UI 리디자인 (아래 "화면 디자인" 절)
  //   meetings.search, events.meetingsChanged
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
- whisper 호출 예: `whisper-cli -m <model> -f <wav> -l ko --output-json-full -of <out> --print-progress` (+ 단어 타임스탬프 옵션, VAD 옵션은 Phase 1 튜닝 결과 반영).
- diarization 호출 파라미터: **`--clustering.num-clusters=<참석자 수>`가 기본 경로**(녹음 정지 시 사용자가 입력, `meetings.speaker_count`). 참석자 수가 없을 때만 `--clustering.cluster-threshold=0.8`로 폴백한다 — 임계값 군집은 녹음 길이에 비례해 화자가 늘어나므로(`docs/phase1-results.md` 6절) 참석자 수 입력을 UI에서 권장한다. 최소 지속 시간은 기본값 유지. 프로바이더는 CPU 고정(`coreml`은 훨씬 느림).
- 참석자 수가 있으면 병합 단계의 군소 화자 흡수(`absorbMinorSpeakers`)를 건너뛴다 — k개로 자른 클러스터는 전부 실제 화자로 보고, 짧게 한 마디 한 참석자를 지우지 않기 위해서다.
- 참석자 수를 실제보다 크게 넣어도 sherpa-onnx는 실패하지 않고 **k개 이하**로 나눈다(합성 3화자 115초에 `num-clusters=10` → 7개, 5초 녹음에 3 → 2개). 과분할은 Phase 3의 화자 병합 UI로 고칠 수 있으므로 main에서 따로 막지 않는다.
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
  녹음본 재생은 요구사항이 아니고, 71분 16kHz mono WAV가 약 136MB라 기본값을 보관으로 두면 디스크가 빠르게 찬다.
  대신 지운 회의는 재처리할 수 없다 — 그래서 실패한 잡에는 이 정책을 적용하지 않는다.
- 진행률은 각 단계 시작·종료와 whisper/sherpa의 퍼센트 로그를 `pipeline:progress`로 push한다. 마지막에 `stage='done'` 또는 `'error'`를 한 번 보낸다.
  `percent`는 **그 단계 안에서의 퍼센트**다. 여러 단계를 하나의 막대로 합치는 계산은 renderer가 `src/shared/progress.ts`로 한다.
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

## 녹음 (renderer)

**오디오 그래프의 소유자는 위젯 패널 창 하나뿐이다** (Phase 5-3, 아래 절). 메인 창은 녹음을 시작·정지하는
명령만 보내고 상태는 `recording:state`로 받는다. 아래 규칙은 그래프를 실제로 만드는 쪽(위젯)에 적용된다.

- `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })`
- `new AudioContext({ sampleRate: 16000 })` → `audioWorklet.addModule(workletUrl)` → 프로세서가 128프레임 단위로 받은 Float32를 `CHUNK_SAMPLES`(8192, 약 0.5초)씩 모아 `port.postMessage`.
- **워크릿 파일은 `src/renderer/src/worklet/pcmRecorder.js`에 두고 `import workletUrl from '@renderer/worklet/pcmRecorder.js?url'`로 로드한다.**
  `resources/` 아래에 두면 Vite 개발 서버가 서빙하지 않고 패키징 시에도 `process.resourcesPath`로 흩어져 renderer가 URL로 접근할 수 없다.
  `?url`은 개발 모드에서는 dev 서버 경로를, 빌드에서는 `out/renderer/assets/`에 복사된 경로를 준다.
  단 Vite는 작은 에셋을 `data:` URL로 인라인하는데, renderer의 CSP가 `script-src 'self'`라 인라인되면 `addModule`이 차단된다.
  `electron.vite.config.ts`의 renderer `build.assetsInlineLimit`에서 워크릿만 인라인 대상에서 빼 **항상 파일로 내보낸다**.
- 레벨 미터는 별도 `AnalyserNode`를 붙이지 않고 **main이 `recording:chunk`로 받은 청크의 RMS**를 계산해
  `recording:state`에 실어 보낸다 (노드를 하나 덜 만들고, 위젯과 메인 창이 같은 값을 본다).
  RMS 계산은 `src/shared/audio.ts`의 순수 함수로 두고 vitest로 검증한다.
- 정지 시 `IPC.recording.stop` → main이 WAV 헤더를 확정하고 파이프라인 잡을 큐에 넣는다.
- **참석자 수(1~`MAX_SPEAKER_COUNT`=20, 정수)는 main의 녹음 세션이 들고 있는다.** 위젯과 메인 창 양쪽에 입력란이 있어
  값의 출처가 둘이 되므로, 입력이 바뀔 때마다 `recording:setSpeakerCount`로 main에 보내고 `recording:state`로 양쪽을 동기화한다.
  정지 시점에는 main이 보관값을 `meetings.speaker_count`에 저장해 화자 분리의 `num-clusters`로 쓴다.
  `StopRecordingRequest`에는 `speakerCount`를 싣지 않는다 — 두 경로가 생기면 "어느 쪽 값이 이겼는지"를 따져야 한다.
  비우면 임계값 폴백이며, 그 경우 화자가 과분할될 수 있다고 입력란 옆에 안내한다.
- Float32 → Int16 PCM 변환은 main의 `audio/wavWriter.ts`에서 수행 (renderer는 원본 Float32 `ArrayBuffer`만 전달).
- 샘플레이트·청크 크기 상수는 `src/shared/audio.ts`에 한 번만 정의해 renderer와 main이 함께 쓴다.
- `AudioContext`가 16kHz 요청을 무시할 수 있으므로 실제 `context.sampleRate`를 확인해 다르면 녹음을 시작하지 않고 안내한다 (`references/pitfalls.md`).

## 녹음 위젯 패널 (Phase 5-3)

회의 중에 앱 창을 앞으로 꺼내지 않고도 녹음을 시작·정지하고, 녹음 중이라는 사실과 경과 시간을 항상 볼 수 있게 한다.
구성은 **화면 우측에 떠 있는 플로팅 패널 + 메뉴바(Tray) 시간 표시 + 전역 단축키** 세 가지다.

### macOS WidgetKit 위젯을 만들지 않는 이유

알림 센터·데스크탑에 놓는 진짜 macOS 위젯은 SwiftUI로 작성한 **앱 확장(Widget Extension)** 이어야 한다.
Electron 번들에 Xcode로 따로 빌드한 확장을 끼워 넣고 App Group으로 상태를 공유하는 편법이 있지만,
확장마다 별도 서명·notarization 대상이 늘고(`references/distribution.md` 6절), 녹음 상태를 프로세스 밖으로 한 번 더
복제해야 하며, 버튼 동작은 `AppIntent`로 호스트 앱을 깨우는 우회가 필요하다. 얻는 것은 외형뿐이라 채택하지 않는다.
**"위젯"은 이 문서에서 항상 아래의 Electron 플로팅 패널을 가리킨다.**

### 창 속성과 배치

| 속성 | 값 | 이유 |
| --- | --- | --- |
| `frame` | `false` | 제목 표시줄 없는 패널. 드래그는 `-webkit-app-region: drag` 영역으로 |
| `type` | `'panel'` | 다른 앱 위에 뜨면서 **키 입력 포커스를 뺏지 않는다**. 회의 중 타이핑을 방해하면 안 된다 |
| `alwaysOnTop` | `true` (`setAlwaysOnTop(true, 'floating')`) | 브라우저·화상회의 창 위에 유지 |
| `visibleOnAllWorkspaces` | `{ visibleOnFullScreen: true }` | 화상회의를 전체화면으로 쓰는 경우가 많다 |
| `resizable` / `maximizable` | `false` | 고정 크기. 레이아웃 분기를 만들지 않는다 |
| `skipTaskbar` | `true` | Dock·앱 전환기에 창이 두 개로 보이지 않게 |
| `vibrancy` | `'popover'` | 네이티브 패널 질감. 배경색을 직접 칠하지 않는다. `'hud'`는 시스템 테마와 무관하게 어두운 재질이라 라이트 모드의 어두운 글자와 겹쳐 색이 깨진다 |
| `visualEffectState` | `'active'` | 기본값(`followWindow`)은 창 포커스에 따라 재질이 바뀐다. 패널은 대부분 비활성 상태라 포커스를 받을 때마다 색이 튄다 |
| 비활성 시 불투명도 | 포커스를 잃으면 `setOpacity(widgetFadeOpacity)`, 받으면 `1` | 회의 화면을 가리는 느낌을 줄인다. `showInactive`로 뜨므로 처음부터 반투명으로 시작한다. 설정 `widget.fade`(기본 켜짐)로 끄면 항상 `1`, 값은 `widget.fadeOpacity`(기본 0.55, 0.2~0.95) |
| `backgroundThrottling` | **`false`** | 숨겨지거나 가려진 창은 타이머·메시지 처리가 throttling된다. 그래프 소유자가 이 창이라 필수 |

- 위치는 `screen.getPrimaryDisplay().workArea` 기준으로 **우측 가장자리에 여백을 두고 세로 중앙**에 놓는다.
  `bounds`가 아니라 `workArea`를 써야 메뉴바·Dock을 침범하지 않는다. 디스플레이 구성이 바뀌면(`screen`의 `display-metrics-changed`) 다시 계산한다.
- 사용자가 패널을 옮기면 그 위치를 기억한다. 저장은 `settings` 테이블(`widget.bounds`)에 두고, 저장된 위치가
  현재 디스플레이 밖이면 버리고 기본 위치로 되돌린다 (외장 모니터를 뺀 뒤 화면 밖에 남는 것을 막는다).

### 라우트와 창 구성

- 위젯은 **별도 HTML 엔트리를 만들지 않고** 같은 `index.html`의 해시 라우트 `#/widget`으로 띄운다
  (`loadFile(..., { hash: '/widget' })` / 개발 모드는 `loadURL(url + '#/widget')`). **해시에 앞의 `/`를 빼면 `#widget`이 되어 라우트가 맞지 않는다**. `createHashRouter`를 쓰기 때문에 가능하고,
  `electron.vite.config.ts`의 rollup input을 건드리지 않아 빌드 구성이 그대로다.
- `/widget`은 `RequireModels` 가드 **밖**에 둔다. 가드 안에 두면 모델이 없을 때 위젯 창에 온보딩 화면이 뜬다.
  대신 위젯이 `models:status`를 직접 조회해 준비 전이면 시작 버튼을 막고 "메인 창에서 모델을 먼저 준비해 주세요"를 보여준다.
- 메인 창 참조를 `windows/main.ts`가 들고 있어야 한다. 기존 `BrowserWindow.getAllWindows()[0]` 방식은 위젯이 0번이 될 수 있어
  **`app.on('activate')`의 재생성 조건과 `second-instance`의 포커스 대상이 깨진다.** 두 곳 모두 "메인 창이 없거나 파괴됐는지"로 바꾼다.
- 창이 둘이므로 진행률·업데이트 브로드캐스트(`broadcast`)는 그대로 두 창에 간다. 위젯은 자기가 쓰지 않는 이벤트를 구독하지 않으면 그만이다.

### 녹음 상태의 단일 출처

녹음이 두 창에서 보이므로 **진행 중 녹음의 상태는 main의 세션(`src/main/audio/session.ts`)이 단일 출처**가 된다.

```ts
export interface RecordingStateEvent {
  meetingId: string | null
  /** 시작 시각(epoch ms). 경과 시간은 받는 쪽이 Date.now()로 계산한다 — 창마다 값이 어긋나지 않는다 */
  startedAt: number | null
  /** 직전 청크의 RMS (0~1). 청크 주기(약 0.5초)로만 갱신된다 */
  level: number
  /** 세션에 보관 중인 참석자 수. 두 창의 입력란을 같은 값으로 맞춘다 */
  speakerCount?: number
  /** 정지가 끝난 순간 한 번만 실린다. 메인 창이 이 회의의 상세로 이동한다 */
  stoppedMeetingId?: string
  /**
   * 시작·정지가 실패한 순간 한 번만 실린다. 마이크 권한 거부나 그래프 생성 실패는 위젯에서만 일어나는데,
   * 시작을 누른 사람은 메인 창에 있을 수 있다. 실패를 세션에 모아 두 창이 같은 안내를 본다
   */
  errorMessage?: string
}
```

- **경과 시간을 이벤트로 보내지 않는다.** `startedAt`만 주고 각 창이 계산하면 IPC 횟수가 늘지 않고, 창이 가려져 렌더가 밀려도 값이 정확하다.
- 창이 새로 열렸을 때를 위해 조회 채널 `recording:state`(invoke)를 함께 둔다. 이벤트만 있으면 늦게 연 창이 현재 상태를 모른다.
- 전역 단축키·Tray 메뉴로 녹음을 시작하려면 main이 위젯에 지시해야 한다 (`getUserMedia`는 renderer에만 있다).
  이 방향의 push 채널이 `recording:command`(`{ kind: 'start' | 'stop' | 'toggle' }`)다. 위젯이 그래프를 만든 뒤 평소처럼 `recording:start`를 invoke한다.
  main → renderer → main으로 한 바퀴 도는 모양이지만, 마이크 접근이 renderer 전용이라 피할 수 없다.
- **메인 창의 시작·정지 버튼도 같은 경로를 탄다.** 메인 창은 `recording:control`(invoke)로 main에 요청하고,
  main이 위젯에 `recording:command`를 push한다. 메인 창이 `recording:start`를 직접 부르면 그래프 없는 녹음이 시작돼
  빈 WAV가 남는다.
- **위젯 창은 `widget.enabled`와 무관하게 항상 만든다.** 이 창이 오디오 그래프의 소유자라, 창이 없으면 전역 단축키로도
  녹음할 수 없다. 설정은 **보이는지 여부만** 정한다 (숨은 창이 그래프를 들고 있어도 되는 이유가 `backgroundThrottling: false`다).
- **참석자 수 보관값은 정지 후에도 남는다.** 다음 녹음이 같은 값으로 시작하지만 두 창의 입력란에 계속 보이므로 숨은 상태가 아니다.
  세션마다 지우면 위젯에서 시작 → 메인 창에서 입력하는 흐름이 매번 초기화된다.

### 메뉴바 (Tray)

- 아이콘은 `resources/trayTemplate.png`(+`@2x`). 파일명이 `Template`으로 끝나야 macOS가 다크/라이트에 맞춰 반전한다.
- 녹음 중에는 `tray.setTitle('● 12:34')`로 경과 시간을 1초마다 갱신하고, 녹음 중이 아니면 제목을 비워 아이콘만 남긴다.
  타이머는 **녹음 중에만** 돌리고 정지 시 `clearInterval`한다.
- 트레이 메뉴: 녹음 시작/정지 · 위젯 표시/숨김 · 메인 창 열기 · 종료.

### 전역 단축키

- 기본값은 `⌥⌘R` 녹음 토글, `⌥⌘W` 위젯 표시/숨김. `app.whenReady` 이후 등록하고 `will-quit`에서 `unregisterAll`한다.
- **앱 시작 시 등록 실패(다른 앱이 선점)는 앱을 멈추지 않는다.** `globalShortcut.register`의 반환값이 거짓이면 경고 로그만 남기고 진행한다.
  단축키가 없어도 패널과 트레이로 모든 동작을 할 수 있다.
- **설정 화면에서 바꿀 수 있다** (2026-09-24 사용자 요청으로 "고정값" 결정을 뒤집음). 값은 Electron accelerator 문자열로
  `shortcut.recording` / `shortcut.widget`에 저장한다.
  - 허용 형식은 `src/shared/shortcut.ts`의 `isValidAccelerator` 하나가 정한다: 수식키 `Control`·`Alt`·`Shift`·`Command` 중
    `Control`·`Alt`·`Command`가 **하나 이상**(Shift만으로는 일반 타이핑과 겹친다) + 키 하나(`A`~`Z`, `0`~`9`, `F1`~`F12`, `Space`, 방향키).
    renderer의 키 입력 변환(`KeyboardEvent.code` 기준 — `key`는 ⌥ 조합에서 특수문자가 된다)과 main의 검증이 같은 함수를 쓴다.
  - 저장 순서: 검증 → 두 단축키가 같으면 거절 → **등록을 먼저 시도하고 실패하면 이전 단축키로 되돌린 뒤 한국어 오류를 throw** → 성공했을 때만 DB에 쓴다.
    앱 시작과 달리 설정 변경에서는 실패를 삼키지 않는다 — 사용자가 방금 고른 키가 동작하지 않는 걸 모르면 안 된다.
  - **입력받는 동안은 전역 단축키를 해제한다** (`shortcuts:setSuspended`). 해제하지 않으면 현재 단축키를 누르는 순간 녹음이 시작된다.
    입력이 끝나거나(확정·Esc·포커스 이탈) 설정 화면이 언마운트되면 복구한다.
  - 안내 문구의 단축키 표기는 `formatAccelerator`(`⌥⌘R`)로 현재 설정값을 보여준다. 설정을 모르는 화면은 키를 적지 않고 "전역 단축키"라고만 쓴다.

### 설정

`AppSettings`에 `isWidgetEnabled`(DB 키 `widget.enabled`, **기본 켜짐**)를 추가한다. 끄면 앱 시작 시 패널을 띄우지 않고
`⌥⌘W`로도 열리지 않는다. 트레이와 단축키는 패널과 독립적으로 동작한다 — 패널을 껐다고 녹음 토글까지 사라지면 안 된다.

같은 설정 화면에 위젯 반투명(`isWidgetFadeEnabled`, 기본 켜짐)·비활성 불투명도(`widgetFadeOpacity`, 슬라이더)와
두 전역 단축키(`recordingShortcut`, `widgetShortcut`)를 둔다. 불투명도는 저장 즉시 `windows/widget.ts`의 `applyWidgetOpacity`로 반영하고,
단축키는 위 "전역 단축키" 절의 저장 순서를 따른다.

설정 화면은 **카테고리별로 묶는다** (2026-09-24 사용자 요청). 항목이 늘어 한 줄 나열로는 찾기 어려워졌기 때문이다.
페이지 제목(`h1` "설정")은 `pages/Settings`가 갖고, 각 카테고리는 `h2` 제목을 가진 `section`이다.

| 순서 | 카테고리 | 항목 | 위치 |
| --- | --- | --- | --- |
| 1 | 녹음·처리 | 원본 녹음 파일 보관(`isAudioKept`), 조용히 처리(`isQuietProcessing`) | `SettingsSection` |
| 2 | 녹음 위젯 | 위젯 패널(`isWidgetEnabled`), 위젯 반투명(`isWidgetFadeEnabled`), 비활성 불투명도(`widgetFadeOpacity`) | `SettingsSection` |
| 3 | 단축키 | 녹음 시작·정지(`recordingShortcut`), 위젯 표시·숨김(`widgetShortcut`) | `SettingsSection` |
| 4 | 모델 | 음성 인식 모델, 요약 모델 | `ModelDownloadSection`, `SummaryModelSection` (온보딩과 공유하므로 따로 감싸는 제목 없이 두 위젯의 `h2`를 그대로 카테고리 제목으로 쓴다) |
| 5 | 용어 사전 | 팀 소개, 초안 만들기, 용어 목록 (Phase 5-4) | `setting/GlossarySection` (자기 채널로 따로 읽고 쓰므로 `SettingsSection`의 한 번 로드와 무관하다. 모델 위젯과 같이 `children`으로 끼운다) |
| 6 | 업데이트 | 업데이트 확인(`isUpdateCheckEnabled`), 지금 확인(`UpdateCheck`) | `SettingsSection` |

- 설정값 로드는 한 번만 한다. 그래서 `SettingsSection`이 1~3과 5를 모두 그리고, 모델 카테고리는 `children`으로 받아 3과 5 사이에 끼운다.
  페이지는 `<SettingsSection><ModelDownloadSection /><SummaryModelSection /></SettingsSection>` 형태로 배치만 한다.

## 화면 디자인 (UI 리디자인, 2026-09-24)

사용자와 Design 캔버스 시안("여백")으로 확정했다. 시안은 참고 자료이고, 값·구조의 근거는 이 절이다.

### 디자인 토큰 (`packages/design/src/base.css`)

색·간격·반경·글꼴은 `:root` CSS 변수로만 쓴다 (`.claude/rules/general-code-convention.md`). 기존 변수 이름은 유지하고 값만 바꾸며, 모자란 것만 추가한다.

**토큰과 글꼴은 `@meeting-stt/design` 패키지가 단일 정의다** (2026-09-24, `references/monorepo.md` "디자인 패키지"). 브라우저 프로토타입(`apps/web`)도 같은 토큰·글꼴을 import한다.
데스크탑 전용 레이아웃 치수(`--sidebar-width` 272px, `--topbar-height` 52px, `--rail-width` 300px)는 `assets/layout.css`에 둔다.

| 변수 | 값 | 용도 |
| --- | --- | --- |
| `--color-bg` | `#FFFFFF` | 본문 바탕 |
| `--color-sidebar` (추가) | `#F7F7F8` | 사이드바, 선택·hover 행, 스테퍼 버튼 |
| `--color-surface` | `#FFFFFF` | 카드·입력 |
| `--color-surface-hover` | `#F7F7F8` | hover |
| `--color-border` | `#E7E7EA` | 선 |
| `--color-border-strong` (추가) | `#DCDCE0` | 버튼·입력 테두리 |
| `--color-divider` (추가) | `#EDEDF0` | 설정 행 구분선, 상단 바 밑줄 |
| `--color-disabled` (추가) | `#D4D4D9` | 꺼진 스위치, 비활성 버튼, 레벨 미터 빈 칸 |
| `--color-text` | `#111113` | 본문 글자, 주요 버튼 바탕 |
| `--color-text-muted` | `#6B6B73` | 보조 글자 (흰 바탕 대비 5.3:1) |
| `--color-text-inverse` (추가) | `#FFFFFF` | 주요·강조 버튼 글자. 기존 `--color-accent-text`는 같은 값으로 남긴다 |
| `--color-accent` | `#4338CA` | 새 녹음·녹음 중 표시·포커스·편집 테두리 (흰 글자 대비 7.9:1) |
| `--color-accent-soft` (추가) | `#E0E7FF` | 녹음 중 점 둘레 |
| `--color-danger` | `#B4232A` | 오류 글자·회의 삭제. **빨강은 오류 전용**이고 녹음에 쓰지 않는다 |
| `--color-danger-soft` (추가) | `#FDECEC` | 오류 배지·삭제 버튼 바탕 |
| `--color-success` | `#15803D` | 완료 체크 |
| `--color-speaker-1`~`4` (추가) | `#0F766E` `#C2410C` `#BE185D` `#854D0E` | 화자 점·이름. 5번째 화자부터 1번부터 다시 돈다 |
| `--font-sans` (추가) | `'Google Sans', 'Pretendard', -apple-system, sans-serif` | 전체 |
| `--font-mono` (추가) | `'Google Sans Code', 'Google Sans', monospace` + `font-variant-numeric: tabular-nums` | 타이머·타임스탬프·퍼센트·단축키 |

- **다크 모드는 보류한다.** 리디자인 동안 `@media (prefers-color-scheme: dark)` 블록을 지우고 `color-scheme: light`로 고정한다.
  반쪽짜리 다크 토큰이 남으면 새 화면이 다크에서 깨진 채로 배포된다. 다크 팔레트는 따로 설계해 다시 넣는다.
- 간격 4·8·12·16·24·32는 기존 `--space-1`~`6`을 그대로 쓴다. 반경은 `--radius-sm` 6 · `--radius-md` 10 · `--radius-lg` 12(추가) · `--radius-full`이다.
  시안의 8px 반경은 토큰을 따로 두지 않고 `--radius-sm`으로 맞춘다 (2px 차이로 단계를 하나 늘릴 이유가 없다).
- 포커스 표시는 모든 컨트롤이 `:focus-visible`에 `2px solid var(--color-accent)` 외곽선 + 2px 간격으로 통일한다.

### 공통 컴포넌트 (`shared/components/primitives/ui`)

도메인 로직 없이 UI만 다룬다. 색은 위 토큰만 쓴다.
**이 표가 두 앱의 계약이다.** 패키지는 `react`를 import하지 않으므로 브라우저 프로토타입은 같은 계약을 `apps/web/src/components/*`에 따로 구현한다 (`Button`·`Badge`·`Icon`·`Switch`·`Stepper`·`ProgressBar`·`LevelWaveform`). 계약을 바꾸면 두 구현을 같이 고친다. 아래 레이아웃 컴포넌트는 데스크탑 창 구조 전용이라 웹에 두지 않는다.

| 컴포넌트 | 계약 |
| --- | --- |
| `Button` | `variant`: `accent`(강조 바탕 — 새 녹음·녹음 시작, 화면당 하나) · `primary`(잉크 바탕, **기본값** — 화면의 주 동작) · `secondary`(흰 바탕 + `--color-border-strong` 테두리) · `danger`(`--color-danger-soft` 바탕 + 빨간 글자 — 삭제 확인에만). `size`: `md`(기본) · `sm`(상단 바·행 안). 비활성은 `--color-disabled` 바탕. **녹음 정지에 `danger`를 쓰지 않는다** (빨강은 오류 전용) — 녹음 화면은 `primary`, 위젯은 `secondary` |
| `Badge` | `tone`: `neutral`(회색 면) · `accent`(`--color-accent-soft` 바탕 + 강조 글자) · `success`(초록 글자) · `danger`(`--color-danger-soft` 바탕 + 빨간 글자). 바탕을 칠한 강한 배지는 두지 않는다 |
| `Switch` | `<button role="switch" aria-checked>`. props `isChecked`, `onChange(next)`, `ariaLabel` 또는 `ariaLabelledBy`(설정 행 제목의 id), `disabled`. 켜짐은 잉크, 꺼짐은 `--color-disabled`. Space·Enter는 네이티브 버튼 동작으로 토글된다 |
| `Stepper` | 숫자 입력 + −/+ 버튼. **값은 문자열**(`value`, `onChange(text)`) — 입력 중 비어 있거나 잘못된 값을 부모가 그대로 들고 검증하기 때문이다 (`useSpeakerCount`). props `min`, `max`, `label`(입력 이름), `placeholder`, `isInvalid`. 동작: 빈 값(또는 정수가 아닌 값)에서 + 는 `min`, − 는 비활성. `min`에서 − 는 **값을 비운다**("모름"). `max`에서 + 는 비활성. 범위를 넘는 값에서 −/+ 는 범위 안으로 끌어온다 |
| `LevelWaveform` | 파형형 레벨 미터. `LevelMeter`(가로 막대)를 대체한다. props `levels`(0~1, 오래된 것부터), `barCount`. 값이 모자라면 오른쪽을 `--color-disabled` 빈 막대로 채우고, 넘치면 최근 `barCount`개만 그린다. 레벨 기록은 `useRecordingState`가 `levels`로 들고 있다 (최근 48개, 청크 주기 약 0.5초) |

레이아웃 공통 컴포넌트는 `shared/components/primitives/layout`에 둔다. 여러 위젯이 같은 모양을 써야 해서 위젯의 `ui` 세그먼트가 아니라 공용이다.

| 컴포넌트 | 계약 |
| --- | --- |
| `TopBar` | 본문 상단 52px 바. `title`(왼쪽 회색 글자) + `children`(오른쪽 동작). 바 전체가 창 끌기 영역이고 안의 컨트롤은 `no-drag` |
| `SettingGroup` | 설정 카테고리 — 회색 소제목(`h2`) + 행 목록. `aria-labelledby`로 제목과 묶는다 |
| `SettingRow` | 설정 한 행 — 왼쪽 제목·설명, 오른쪽 `control`, 아래 `children`(펼침 영역). 제목 id를 `titleId`로 받아 `Switch`의 `ariaLabelledBy`에 넘긴다. 행 사이는 `--color-divider` 선 |

### 글꼴 동봉

- Google Sans(라틴·숫자), **Pretendard(한글)**, Google Sans Code(숫자·시간)를 `packages/design/src/fonts/`에 넣고 `packages/design/src/fonts.css`의 `@font-face`로 로드한다. 두 앱이 같은 파일을 쓴다.
  Google Sans에는 한글 글리프가 없어 한글은 스택의 다음 글꼴인 Pretendard로 떨어진다.
- 셋 다 **SIL OFL**이다. 배포처가 준 파일을 **수정하지 않고** 동봉한다 (OFL의 예약 글꼴 이름 조항 때문에 서브셋·변환한 파일은 원래 이름을 쓸 수 없다).
  각 글꼴의 `OFL.txt`를 같은 폴더에 둔다. 폴더는 글꼴마다 하나(`fonts/googleSans`, `fonts/googleSansCode`, `fonts/pretendard`)다.
- 파일 **이름**만 카멜 규칙에 맞춰 바꾼다 (`GoogleSans[GRAD,opsz,wght].ttf` → `googleSansVariable.ttf`). 대괄호·쉼표가 CSS `url()`과 번들러 경로에서 말썽을 부린다.
  파일 내용과 글꼴 이름(name 테이블)은 건드리지 않으므로 OFL 조항과 무관하다. 출처: Google Sans·Google Sans Code는 `google/fonts` 저장소의 `ofl/`, Pretendard는 npm `pretendard@1.3.9`의 가변 woff2.
- 오프라인 앱이라 Google Fonts CDN을 쓰지 않는다. CSP도 외부 글꼴 출처를 열지 않는다. 브라우저 프로토타입도 같은 동봉 파일을 정적 자산으로 배포한다 (CDN 없음).

### 메인 창과 사이드바 레이아웃

- 메인 창 기본 크기 **1280×800**, 최소 **1040×640**. 두 칸(사이드바 272px + 본문)이 최소 폭에서도 회의록 줄 길이를 지키는 크기다.
- `titleBarStyle: 'hiddenInset'`으로 신호등을 사이드바 위에 겹친다. 사이드바 상단 52px과 본문 상단 바는 `-webkit-app-region: drag`,
  그 안의 버튼·입력은 `no-drag`로 둔다 (`references/pitfalls.md`에 함정 추가).
- 라우터: `RequireModels` 아래에 `AppShellLayout`(사이드바 + `<Outlet />`)을 두고 홈·녹음·상세·설정을 그 자식으로 옮긴다. 온보딩·위젯은 셸 밖이다.
  `UpdateBanner`는 홈이 아니라 셸의 본문 위에 둔다 (어느 화면에서든 보이도록).
- 사이드바(`meeting/MeetingSidebarSection`) 구성: 새 녹음 버튼(녹음 중이면 경과 시간과 함께 "녹음 중"으로 바뀌고 `/record`로 이동) → 검색 입력 →
  회의 목록(오늘·이번 주·이전으로 묶음, 처리 중이면 `PipelineProgress`, 오류면 한 줄 안내) → 하단 설정 링크.
  (시안 최종본에서 "이 기기에서만 처리" 표시를 뺐다. 온보딩이 같은 내용을 말한다.)
  날짜 묶음 계산은 순수 함수로 두고 vitest로 검증한다.
- **목록 갱신**: 사이드바는 화면을 옮겨도 언마운트되지 않으므로, 예전처럼 "홈에 들어올 때 다시 불러오기"로는 제목 변경·삭제·처리 완료가 반영되지 않는다.
  main이 회의 목록에 영향을 주는 변경(녹음 시작·정지, 제목 변경, 삭제, 파이프라인 처리 시작·`done`·`error`) 뒤에 **`meetings:changed` push**를 보내고,
  사이드바가 받으면 `meetings:list`(검색 중이면 `meetings:search`)를 다시 부른다. payload는 없다 — 목록 전체를 다시 읽어도 로컬 SQLite라 싸다.
  녹음 정지·처리 시작을 넣은 이유: 정지 직후 행은 `recording`, 큐가 잡으면 `processing`으로 바뀌는데 이 둘을 놓치면 사이드바가 처리 중 진행률 대신 "녹음 중"을 계속 보여준다.
  main은 `src/main/meetingsChanged.ts`의 리스너 하나로 모으고(`notifyMeetingsChanged`), `index.ts`가 모든 창에 브로드캐스트한다 — 진행률 리스너와 같은 모양이다.

### 화면별 구성

- **회의 상세**: 상단 바(복사·마크다운 복사·더보기) + 두 칸 — 가운데 회의록, 오른쪽 레일 300px에 요약 카드와 화자 목록.
  화자 목록은 회의록과 **같은 `useMeeting` 상태**를 써야 하므로(훅 인스턴스마다 상태가 따로다) `TranscriptSection`이 레일까지 그리고,
  요약은 `aside` 슬롯으로 받는다: `<TranscriptSection meetingId aside={<SummarySection meetingId />} />`. 기존 `SpeakerBar`는 레일의 화자 목록으로 바뀐다.
  요약 카드의 헤더는 접기/펼치기 토글(`aria-expanded`)이다 — 기본은 펼침이고, 접으면 본문·버튼이 숨고 헤더만 남는다. 요약이 진행 중일 때 접으면 헤더 캡션에 진행률을 대신 보여 준다. 접힘 상태는 저장하지 않는다(회의를 옮기면 다시 펼침).
  회의 삭제는 더보기 안으로 들어가지만 2단계 인라인 확인 규칙은 그대로다.
  상단 바 제목은 회의 날짜 묶음("회의록 · 오늘")이다 — 사이드바와 같은 날짜 묶음 함수(`shared/utils/meetingDateGroup`)를 쓴다.
  발화 행은 시각 열 · (화자 + 본문) · 복사 버튼 세 칸이고, 복사 버튼은 행에 마우스를 올리거나 포커스가 들어올 때만 보인다. 화자는 색 점 + 이름의 `<select>`로 바꾼다.
  화자 색은 화자 목록 순서대로 `--color-speaker-1`~`4`를 돌려 쓴다. 화자 목록의 "화자 합치기"는 합치기 모드를 켜고, 모드 안에서 행마다 "합치기" → 대상 선택의 기존 두 단계를 거친다.
- **녹음**: 큰 타이머, 파형형 레벨 미터, 참석자 수 **스테퍼**(−/+와 숫자 입력, "모름"은 값을 비운다), 정지 버튼("녹음 정지하고 회의록 만들기").
  스테퍼는 `shared/components/primitives/ui/Stepper`로 만들어 위젯과 함께 쓴다. 참석자 수 범위·검증은 지금처럼 `@meeting-stt/core/speakerCount`.
- **위젯**: 같은 스테퍼, 대기 중이면 강조색 "녹음 시작", 녹음 중이면 테두리형 "녹음 정지". 파형은 넣지 않는다 — 좁은 패널에서 타이머·녹음 점만으로 녹음 중임이 충분히 보인다 (2026-09-24 사용자 요청으로 제거).
  창 크기는 **300×304**(이전 264×248) — 헤더·타이머·스테퍼·버튼·안내 한 줄이 잘리지 않는 높이다.
  사이드바·위젯에는 단축키 안내를 넣지 않는다 — 두 곳 다 언마운트되지 않아 설정에서 단축키를 바꾸면 틀린 키를 보여준다 (설정 변경 push가 없다). 녹음 화면은 들어올 때마다 설정을 읽으므로 안내한다.
- **설정**: 카테고리 제목 + 행(제목·설명 왼쪽, 컨트롤 오른쪽). 켜기/끄기는 `role="switch"` 버튼인 `primitives/ui/Switch`로 바꾼다. 용어 사전 카테고리도 같은 행 규칙을 따른다.
- **온보딩**: 왼쪽 안내, 오른쪽 모델 선택 카드와 다운로드 목록("함께 받는 모델": 완료·퍼센트·대기)의 두 칸. 제목 문구는 "인터넷 사용, 비용, 시간 제한 없는 회의록"(시안).
  설정의 음성 인식 모델은 같은 `ModelDownloadSection`을 `variant="setting"`으로 그려 한 행(현재 모델 · 설치됨 + "모델 바꾸기")으로 접어 두고, 누르면 선택 카드가 펼쳐진다.
- 제목은 굵은 산세리프(명조 없음). 아이콘은 인라인 stroke SVG이고 아이콘 전용 버튼에는 `aria-label`을 붙인다.

### 회의록 검색 (`meetings:search`)

| 키 | 채널 | 방향 | 요청 → 응답 |
| --- | --- | --- | --- |
| `meetings.search` | `meetings:search` | invoke | `{ query: string }` → `MeetingSearchResult[]` |
| `events.meetingsChanged` | `meetings:changed` | push | 없음 (위 "목록 갱신") |

- `MeetingSearchResult = { meeting: Meeting; match: { utteranceId: string; text: string; startSec: number } | null }`.
  제목으로만 걸리면 `match`는 `null`, 발화로 걸리면 **순서(`ord`)가 가장 앞선 발화 하나**를 준다.
- 대상은 **회의 제목과 발화 텍스트**. 화자 이름·요약은 넣지 않는다 (필요해지면 추가).
- main은 `query`를 trim하고 비면 빈 배열을 돌려준다. `LIKE '%' || ? || '%' ESCAPE '\'`로 찾고 `%`·`_`·`\`는 이스케이프한다.
  SQLite `LIKE`는 ASCII 대소문자를 구분하지 않아 영문 용어도 그대로 찾힌다. 정렬은 `created_at DESC`, 최대 50개(`SEARCH_RESULT_LIMIT`).
  이스케이프 함수(`toLikePattern`)는 `src/main/searchQuery.ts`에 두고 `searchQuery.test.ts`로 검증한다 — `src/main/db/*`는 `better-sqlite3` 때문에 vitest가 import할 수 없다.
- **FTS5를 쓰지 않는 이유**: 기본 `unicode61` 토크나이저는 띄어쓰기로만 나눠 "회의록을"에서 "회의록"을 못 찾고,
  `trigram`은 3글자 미만 질의를 못 찾는다 (한국어 검색어는 2글자가 흔하다). 데이터가 한 사람의 로컬 회의라 전체 스캔으로 충분하다.
  느려지면(수천 회의) 그때 측정하고 바꾼다. 스키마 변경은 없다.
- renderer: 입력 200ms 디바운스(`SEARCH_DEBOUNCE_MS`), 검색 중에는 사이드바 목록이 결과로 바뀌고 발화 조각의 일치 부분을 `<mark>`로 강조한다.
  결과를 누르면 그 회의 상세로 간다. **해당 발화로 스크롤하는 것은 후속 과제**다. Esc·지우기 버튼으로 검색을 끝내면 원래 목록으로 돌아간다.

## 화면 라우트 (Phase 2)

`file://`에서도 동작해야 하므로 `createHashRouter` + `RouterProvider`를 쓴다. 라우팅 관련 코드는 `src/renderer/src/shared/routes/`에만 두고, 다른 코드는 경로 문자열을 직접 쓰지 않는다.

- `routes/paths.ts` : 경로 상수와 경로 조립 함수(`meetingDetailPath`). **컴포넌트는 여기만 import한다.**
- `routes/index.tsx` : 페이지를 물린 라우터 정의. 페이지를 import하므로, 컴포넌트가 이 파일에서 경로 상수를 가져오면 `widget → routes → page → widget` 순환 import가 된다.

리디자인(아래 "화면 디자인" 절)부터 홈·녹음·상세·설정은 **사이드바 레이아웃**(`shared/routes/layout.tsx`의 `AppShellLayout`) 안에 그려진다.
회의 목록은 페이지가 아니라 사이드바(`meeting/MeetingSidebarSection`)가 들고, `MeetingListSection`은 없앤다.

| 경로 | 페이지 | 배치하는 widget |
| --- | --- | --- |
| `/` | `pages/Home` | 빈 상태 안내 ("회의를 고르거나 새로 녹음하세요") |
| `/record` | `pages/Record` | `recording/RecorderSection` |
| `/meetings/:meetingId` | `pages/MeetingDetail` | `meeting/TranscriptSection` (오른쪽 레일에 `meeting/SummarySection`을 슬롯으로 받음) |
| `/settings` | `pages/Settings` | `setting/SettingsSection` (카테고리 묶음, 모델 위젯을 `children`으로 받음), `model/ModelDownloadSection`, `model/SummaryModelSection` |
| `/onboarding` | `pages/Onboarding` | `model/ModelDownloadSection` |
| `/widget` | `pages/Widget` | `recording/WidgetPanelSection` (위젯 창 전용, 가드 밖) |

- `/settings`는 Phase 3에서 원본 WAV 보관 옵션과 함께 추가했다. Phase 4에서 업데이트 확인 옵션(`SettingsSection`),
  음성 인식 모델 변경(`ModelDownloadSection`, 온보딩과 같은 위젯), 요약 모델 다운로드(`SummaryModelSection`)를 붙였다.
  이후 발열·팬 소음을 줄이는 '조용히 처리' 옵션(`SettingsSection`, `pipeline.quiet`)을 붙였다.
- 온보딩(`/onboarding`)은 Phase 4에서 추가했다. **진입 가드**는 `shared/routes/guards.tsx`의 `RequireModels`가 맡는다 —
  홈·녹음·상세·설정을 자식으로 갖는 경로 없는 레이아웃 라우트로, `models:status`의 `isReady`가 거짓이면 `/onboarding`으로 보낸다.
  온보딩 페이지 자체는 가드 밖에 있고, 다운로드가 끝나면 홈으로 이동한다. 가드는 레이아웃이 처음 마운트될 때 한 번만 조회한다
  (모델은 온보딩 밖에서 사라지지 않는다).
- `features/update/UpdateBanner`는 `update:available` 이벤트를 받았을 때만 나타난다 (`references/distribution.md` 7절). 리디자인부터 홈이 아니라 셸 본문 위에 둔다.
- 흐름: 사이드바(리디자인 전에는 홈)에서 "새 녹음" → `/record`(또는 위젯·단축키) → 정지 → main이 잡을 큐에 넣고 `/meetings/:meetingId`로 이동 → 처리 중 상태를 보여주다가 `pipeline:progress`의 `done`을 받으면 회의록을 다시 불러온다.
- **Phase 5-3부터 `/record`를 벗어나도 녹음은 계속된다.** 오디오 그래프가 위젯 창으로 옮겨 갔기 때문이다
  (그 전에는 `useRecorder`가 언마운트될 때 녹음을 정지했다). 대신 **앱이 종료될 때**(`before-quit`) 진행 중 녹음이 있으면
  WAV 헤더를 확정하고 잡을 큐에 넣는다. 헤더가 확정되지 않은 WAV는 파이프라인이 읽지 못한다.
- 위젯에서 정지하면 메인 창을 앞으로 가져오고 그 회의의 상세로 이동한다 (`stoppedMeetingId`). 녹음을 끝낸 직후에 보고 싶은 것은 결과 화면이다.
- Phase 2에서 진행률 **막대**는 만들지 않았다. Phase 3에서 `modules/features/pipeline/PipelineProgress`로 추가했다 (위 "진행률 표시" 절).

## 편집 UI 규칙 (Phase 3)

- **인라인 편집**은 `shared/components/composites/InlineEditableText` 하나로 통일한다 (회의 제목, 발화 텍스트, 화자 이름).
  표시 상태는 `<button>`이라 키보드로 진입할 수 있고, blur·Enter로 확정, Escape로 취소한다.
  빈 문자열은 저장하지 않고 원래 값으로 되돌린다 — 발화 텍스트나 화자 이름이 빈 채로 남으면 회의록이 읽히지 않기 때문이다.
- **되돌릴 수 없는 동작(회의 삭제, 화자 병합)은 2단계로 만든다.** `window.confirm` 같은 모달 대화상자를 쓰지 않는다 —
  renderer를 멈추지 않고, 스타일을 맞출 수 있고, happy-dom 통합 테스트에서 그대로 검증할 수 있기 때문이다.
  - 회의 삭제: "삭제" → 안내 문구 + "삭제"/"취소"
  - 화자 병합: "합치기" → 합칠 대상 화자 목록 → 대상 클릭 (대상을 고르는 행위 자체가 확인 단계)
- **화자 재배정**은 발화 행의 `<select>`로 한다. 재배정 후 앞뒤 발화가 같은 화자가 되어도 자동으로 합치지 않는다 —
  병합은 파이프라인 결과를 만들 때의 규칙이고, 사용자가 고친 뒤에 문단이 임의로 재구성되면 편집 위치를 잃는다.

## 로컬 LLM 요약 (Phase 5)

STT·화자 분리와 **같은 방식**(외부 바이너리 spawn)으로 붙인다. 서버·HTTP·추가 런타임을 들이지 않는다.

- 엔진은 llama.cpp의 **`llama-cli`** 를 `child_process.spawn` 한다. `llama-server`(HTTP)는 쓰지 않는다 —
  단발 요약에 상주 서버·포트·프로세스 수명 관리가 필요 없고, "네트워크를 쓰지 않는다"는 원칙을 코드로도 지키기 쉽다.
- 호출 형태:

  ```
  llama-cli -m <gguf> -sysf <system.txt> -f <prompt.txt> -o <out.txt>
            -st --no-display-prompt --no-escape --no-warmup
            -c <ctxSize> -n <maxPredict> --temp <temp> -t <threads>
  ```

  - **프롬프트·시스템 프롬프트·출력은 전부 파일로 주고받는다.** 71분 회의록은 수만 자라 argv에 넣으면 길이 제한에 걸리고,
    `-e`(escape)가 기본 켜져 있어 본문의 `\n`·`\t` 같은 문자열이 제어문자로 바뀐다. `--no-escape`를 함께 준다.
  - `-st`(single-turn)로 한 턴만 돌고 종료한다. 대화 모드로 들어가면 프로세스가 stdin을 기다리며 끝나지 않는다.
  - `--no-display-prompt` + `-o`로 **결과 파일만 읽는다**. stdout에는 로드 로그·타이밍이 섞이므로 파싱하지 않는다.
  - 임시 파일은 `userData/summaries/<meetingId>/`에 만들고 잡이 끝나면 **실패해도 지운다** (정규화본과 같은 규칙).
- **긴 회의록은 map-reduce로 나눈다.** `src/shared/summary.ts`가 회의록을 발화 줄 경계로 청크 예산만큼 자르고,
  청크마다 부분 요약을 만든 뒤 부분 요약들을 이어 붙여 한 번 더 요약한다. 청크가 하나면 reduce 단계를 건너뛴다.
  분할·출력 정리는 순수 함수라 vitest로 검증한다. 청크 예산은 컨텍스트를 통째로 채우지 않고 여유를 둔다(아래 상수 절).
- **파이프라인이 자동으로 요약하지 않는다.** 디테일 화면의 "요약 만들기" 버튼이 `summary:create`를 보낸다.
  요약 모델이 없거나 요약이 실패해도 회의록 자체는 이미 `status='done'`이어야 하기 때문이다.
- 저장은 `meetings.summary` 한 컬럼. **진행 상태용 컬럼은 만들지 않는다** — 진행은 이벤트로만 알리고,
  앱이 꺼져 진행 상태가 사라지면 사용자가 버튼을 다시 누르면 된다.

### 잡 큐 통합

요약도 STT와 같은 CPU·GPU를 쓰므로 **`src/main/pipeline/queue.ts`의 같은 큐(동시성 1)** 에 넣는다.
요약 전용 큐를 따로 두면 STT와 요약이 동시에 돌아 둘 다 느려진다 (`references/pitfalls.md`).

- 큐 항목은 `string`이 아니라 `{ kind: 'pipeline' | 'summary'; meetingId: string }`이고, `drain`이 종류에 따라
  `runPipeline` 또는 `runSummary`를 부른다.
  Phase 5-4의 용어 초안은 회의에 묶이지 않고 결과를 돌려받아야 하므로 `{ kind: 'glossary'; run }` 항목으로 넣는다 (아래 "용어 사전" 절).
- 실패 처리는 종류마다 다르다. 파이프라인 실패는 `meetings.status='error'`로 남기지만,
  **요약 실패는 회의 상태를 건드리지 않는다** — 회의록은 멀쩡하고 요약만 없는 상태이므로 이벤트로만 알린다.

### IPC (Phase 5)

```ts
summary: { create: 'summary:create' },
events: { progress: 'pipeline:progress', summary: 'summary:progress' }
```

- `summary:create`는 큐에 넣기만 하고 즉시 반환한다(응답 없음). 요약은 수 분이 걸려 `invoke`를 매달아 둘 수 없다.
  Phase 3의 "뮤테이션은 갱신된 `MeetingDetail`을 돌려준다" 규약의 예외다 — 이 채널은 값을 바꾸는 게 아니라 **잡을 예약**한다.
- 진행은 `summary:progress`로 push한다: `{ meetingId, stage, percent, summary?, errorMessage? }`.
  `stage='done'`일 때 **요약 텍스트를 함께 실어 보내** renderer가 다시 조회하지 않게 한다.
- `stage='error'`이면 `errorMessage`(한국어)를 함께 보낸다. 회의 상태는 그대로 `done`이다.

### 화면

| 경로 | 페이지 | 추가되는 widget |
| --- | --- | --- |
| `/meetings/:meetingId` | `pages/MeetingDetail` | `meeting/SummarySection` (`TranscriptSection` 위) |

- `SummarySection`은 회의가 `done`이고 발화가 있을 때만 버튼을 활성화한다. 요약이 이미 있으면 본문을 보여주고 "다시 만들기"를 제공한다.
- 요약 텍스트는 마크다운으로 렌더링하지 않는다. 라이브러리를 들이지 않기 위해 **줄바꿈을 보존한 일반 텍스트**로 표시한다.

### 바이너리·모델 확보 (Phase 5)

| 대상 | 확보 방법 | 배치 위치 |
| --- | --- | --- |
| `llama-cli` + 의존 dylib | `ggml-org/llama.cpp` 릴리스의 `llama-<build>-bin-macos-arm64.tar.gz`를 받아 필요한 파일만 꺼낸다 | `resources/bin/darwin-arm64/` |
| 요약 모델 | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (Hugging Face, Apache-2.0) | `scripts/fixtures/models/` (Phase 1 규칙과 동일), 앱은 `userData/models/` |

- llama.cpp 실행 파일의 rpath는 `@loader_path`라 **바이너리와 dylib을 같은 폴더에** 두면 그대로 동작한다 (sherpa-onnx와 같은 구조).
- 아카이브가 `tar.gz`라 `scripts/shell.ts`의 `extractArchive`는 압축 방식을 고정하지 않고 `tar -xf`로 자동 판별한다.
- 릴리스 빌드 번호(`b10622` 등)는 `scripts/assets.ts`에 상수로 고정한다. 최신 빌드를 자동 추적하면 체크섬이 매번 바뀐다.

## 용어 사전 (Phase 5-4)

교정(발음 유사도 후보 + O/X 판정)과 인식(whisper `--prompt`)은 둘 다 **정답 용어 목록**이 있어야 한다 (`docs/phase5-refine-results.md`).
용어 사전은 전역 + 회의별 두 층이고, 이 절은 **전역 층**을 설정에서 만드는 방법이다. 회의별 층은 입력 위치가 정해진 뒤 추가한다.

### 초안은 LLM, 확정은 사람

- 설정의 **팀 소개**(예: "프론트엔드 개발팀, 공용 UI 라이브러리와 패키지 배포를 다룸")를 받아 요약과 같은 `llama-cli` + 요약 모델로 **용어 초안**을 만든다.
- 초안은 저장하지 않는다. renderer가 편집 중인 목록 뒤에 **새 용어만 덧붙이고**(`=` 앞부분 기준, 대소문자 무시) 사용자가 고친 뒤 저장한다.
  모델 초안에는 틀린 읽기(Yarn=와이어너)와 일반어가 섞이고, 일반어 하나가 교정 오탐 수십 개를 만든다 (측정 문서).
- 프롬프트는 "음성 인식이 틀리는 종류(영어 기술 용어·제품·도구 이름·약어·외래어)만, 일반어 제외"로 좁히고 읽기 예시를 준다.
  출력 형식은 GBNF 문법으로 못박는다 (아래). 문법 파일·프롬프트는 `src/shared/glossary.ts`에 둔다.
- **초안은 `영어 표기 = 한글 읽기` 줄만 받는다** (GBNF에서 한글 줄 제거, 2026-09-24). 한글 줄을 허용하면 모델이 문장을 줄 단위로 끊어 적거나
  "버전 관리·소스 코드·기록 템플릿" 같은 일반어로 목록을 채웠다. 한국어 용어(모노레포, 임상시험)는 사용자가 직접 적는다. 저장 형식은 그대로 `용어` 줄도 받는다.
- 프롬프트는 "한국 회의에서 영어 이름 그대로 부르는 말만, 읽기는 뜻이 아니라 소리"를 못박는다. 없으면 `ad performance = 광고 성과`처럼
  한국어 개념을 영어로 번역한 줄이 나오고, 이런 줄은 교정에서 한국어를 영어로 바꾸자는 오탐이 된다.
- **읽기 예시는 기술 용어(Kubernetes·GitHub·React·npm)를 유지한다.** 일상 제품 이름(YouTube·Excel)으로 바꾸면 예시 누출은 줄지만 읽기가 크게 나빠졌다
  (React = 레이크트, Kubernetes = 크로노스). 누출은 한글 줄 제거·줄 수 축소로 대부분 사라졌다.
- **초안은 3~25줄**로 받는다. 5~40줄로 받으면 짧은 팀 소개에서 그 분야의 흔한 이름(프론트엔드 팀에 Nginx·Redis·MongoDB)으로 빈자리를 채운다.
- **팀 소개에 영어로 적힌 이름은 초안 맨 앞에 둔다.** 모델이 적은 줄이면 그 줄을, 빠뜨렸으면 약어는 코드 읽기로, 그 외는 읽기 없이 이름만 넣어 사용자가 읽기를 채우게 한다.
  팀 소개 안내 문구도 "쓰는 기술·도구·제품 이름을 영어 그대로 적어 달라"고 요청한다 — 팀 소개가 짧으면 모델은 실제 회의 용어를 알 수 없다.
- **대문자 약어의 읽기는 코드가 만든다** (`CI/CD` → `씨아이 씨디`). 모델은 약어를 자주 틀리게 읽는다. 대문자·숫자만으로 된 2~6자 토큰(대문자 1자 이상)을 `/`로 나눈 것이 약어다.
  숫자는 영어로 읽는다 (`S3` → `에스쓰리`, `GA4` → `지에이포`).
- **`.js`로 끝나는 이름은 읽기 끝을 `제이에스`로 고친다** (`Next.js = 넥스트 포인트` → `넥스트 제이에스`). 모델이 점을 "포인트·닷"으로 읽는다.
  읽기가 여러 단어면 마지막 단어를 바꾸고, 한 단어면 뒤에 붙인다.
- **사람이 검수한 읽기 사전이 모델 읽기를 덮어쓴다** (2026-09-24). 약어·`.js` 밖의 단어 읽기(Jira=재자, Git=기트, Redux=레덕스, Tailwind=타일윈드, ESLint=엔엘식)는
  4B 모델의 한계라 프롬프트로 못 고친다 (`docs/phase5-refine-results.md` "초안 품질 보강"). 자주 쓰는 개발·제품 용어의 `영어 표기 = 한글 읽기`를
  **`@meeting-stt/core/termReadings`** 에 상수(`TERM_READINGS`)로 두고, `parseGlossaryDraft`가 사전에 있는 용어는 모델 읽기 대신 사전 읽기를 쓴다 — 약어 코드 읽기와 같은 방식이다.
  - 적용 순서는 **사전 → 약어 → `.js`**. 사전은 사람이 검수한 값이라 약어 규칙보다 우선한다 (`SQL = 시퀄`처럼 약어 모양이어도 통째로 부르는 이름을 사전에 적을 수 있다).
  - 찾기는 **대소문자 무시**이고, 맞으면 **표기도 사전 표기로 맞춘다** (`Github = 깃헙` → `GitHub = 깃허브`). 교정·인식은 표기를 그대로 쓰므로 정식 표기가 낫다.
  - 사전은 **읽기만 바꾸고 용어를 더하지 않는다.** 모델이 적지 않은 용어를 사전에서 끌어오면 고정 목록과 같아져 모든 회의를 한 분야로 끌고 간다 (`docs/phase5-results.md`).
    예외는 팀 소개에 적힌 이름(`prependTeamTerms`)이다 — 모델이 빠뜨렸으면 약어와 마찬가지로 사전 읽기를 채운다.
  - 사전에 넣는 것은 **한국 회의에서 영어 이름 그대로 부르는 도구·제품·언어·프레임워크·서비스 이름과 개발·제품 관용어**다. 읽기는 실제로 부르는 소리 하나(흔한 변형이 있으면 쉼표로 2개까지)이고,
    번역어로 부르는 말(배포, 검색)은 넣지 않는다. 사전에 없는 용어는 지금처럼 모델 읽기를 쓰고 사용자가 고친다.
  - 사전은 `packages/core`에 둔다 — 브라우저 프로토타입도 같은 용어 사전 형식을 쓰게 될 때 읽기 값이 갈라지면 안 되고, 런타임 의존이 없는 순수 데이터라서다.
    테스트(`termReadings.test.ts`)는 표기 중복(대소문자 무시)·읽기가 한글뿐인지·찾기 규칙을 본다.
- 요약 모델이 없으면 "초안 만들기"를 막고 요약 모델을 먼저 받으라고 안내한다. 직접 입력은 모델 없이도 된다.

### 실행과 큐

- `glossary:draft`는 **초안을 결과로 돌려주는 invoke**다 (`{ teamDescription }` → `{ terms: string[] }`). 요약과 달리 10~20초로 짧고,
  결과를 DB가 아니라 편집 중인 화면에 넣으므로 push 이벤트·진행률을 두지 않는다.
- 요약과 같은 GPU를 쓰므로 **같은 큐(동시성 1)** 에 `kind: 'glossary'`로 넣고, 잡이 끝나면 invoke가 풀린다.
  회의 처리 중이면 그 뒤에 돈다 — 화면은 "다른 작업이 끝난 뒤 만듭니다"를 함께 보여준다. 실패는 invoke reject(한국어 메시지)로만 알린다.
- 임시 파일은 `userData/glossary/`에 만들고 끝나면 실패해도 지운다 (요약과 같은 규칙).

### IPC

| 키 | 채널 | 방향 | 용도 |
| --- | --- | --- | --- |
| `glossary.get` | `glossary:get` | invoke | `GlossarySettings` 조회 |
| `glossary.update` | `glossary:update` | invoke | `GlossarySettings` 전체 저장. 정리(공백·빈 줄·중복 제거)한 값을 돌려준다 |
| `glossary.draft` | `glossary:draft` | invoke | 팀 소개로 초안 생성. 저장하지 않는다 |

### 화면

- `setting/GlossarySection` — 팀 소개 `textarea`(최대 500자), "초안 만들기" 버튼, **행 단위 용어 목록**, "저장" 버튼.
- **용어 목록은 한 행에 `용어` 입력 + `한글 읽기(선택)` 입력 + 삭제 버튼**으로 편집한다 (2026-09-24 사용자 결정, 이전의 한 줄 텍스트 `textarea`를 대체).
  텍스트 방식은 사용자가 `=`·쉼표 구분자를 직접 지켜야 했고, `:`·`->`·전각 쉼표를 쓰면 경고 없이 한 용어로 뭉쳤다.
  - 읽기는 **선택**이다. 한글 용어는 그 자체가 발음이고, 읽기가 빈 영어 용어는 교정 때 모델이 읽기를 채운다 (`src/shared/refine.ts`). 적어 두면 모델 읽기보다 정확하다는 점만 안내한다.
  - 읽기가 여러 개면 한 칸에 쉼표로 적는다. `,`·`，`·`、`를 모두 구분자로 받는다. 용어 칸에는 `=`를 입력받지 않는다.
  - 읽기가 빈 대문자 약어는 코드 읽기(`acronymReading`)를 placeholder로 보여 주고, 저장할 때 그 읽기를 채운다.
  - 용어 칸에 여러 줄 텍스트나 `용어 = 읽기` 줄을 붙여 넣으면 줄마다 행으로 나눈다 — `scripts/refine.ts`의 용어 파일을 복사해 옮기는 흐름을 유지한다.
  - 읽기 칸에서 Enter를 누르면 아래에 새 행을 만들고 그 용어 칸으로 이동한다. 빈 용어 행은 저장하지 않는다.
  - **저장·IPC 형식은 바꾸지 않는다.** 행은 renderer 안에서만 쓰고, 저장할 때 `용어` 또는 `용어 = 읽기1, 읽기2` 줄(`GlossarySettings.terms: string[]`)로 직렬화한다.
- 저장은 버튼으로 한다 (blur 저장 아님). 초안을 덧붙인 직후 사용자가 훑어보고 고칠 시간을 준다. 저장하지 않은 변경이 있으면 버튼 옆에 표시한다.

