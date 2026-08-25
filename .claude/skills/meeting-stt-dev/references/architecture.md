# 아키텍처: 프로세스 경계, 디렉터리, IPC

## 프로세스 경계

```
┌──────────────── renderer (Chromium, React) ────────────────┐
│ 페이지: Onboarding / Home / Record / MeetingDetail        │
│ 녹음: getUserMedia → AudioContext(16kHz) → AudioWorklet   │
│       → Float32 PCM 청크를 IPC로 main에 전달              │
│ 나머지는 window.api.* 호출 + 진행률 이벤트 구독만          │
└───────────────────────────┬────────────────────────────────┘
                            │ contextBridge (preload, 타입 고정)
┌───────────────────────────┴──── main (Node) ───────────────┐
│ audio/   PCM 청크 → WAV 파일 append, 종료 시 헤더 확정      │
│ pipeline/ 잡 큐(순차) → normalize → whisper(VAD 내장) → diarize → merge │
│ db/      better-sqlite3, 마이그레이션, 리포지토리           │
│ models/  모델 경로 해석, 다운로드(Range/체크섬), 존재 확인   │
│ bin/     플랫폼별 바이너리 경로 해석, spawn 래퍼            │
│ ipc/     handle 등록, 진행률 send                          │
└────────────────────────────────────────────────────────────┘
```

- 파이프라인 실행은 UI 스레드와 분리한다. 1차는 main에서 `child_process.spawn`(비동기라 이벤트 루프를 막지 않음)으로 충분하며, 병합 로직이 무거워지면 `utilityProcess`로 옮긴다.
- renderer에서는 `fs`, `child_process`, `better-sqlite3`를 절대 import하지 않는다 (스캐폴드가 `sandbox: false`라도 규칙으로 금지).

## 디렉터리 배치 (목표)

```
scripts/                      # Phase 1 검증 스크립트 (`pnpm tsx scripts/<name>.ts`로 실행)
  pipeline.ts                 # wav → normalize → whisper → diarize → merge → 콘솔/JSON 출력
  fixtures/                   # 테스트용 한국어 회의 WAV (git 제외)
resources/
  bin/darwin-arm64/whisper-cli, sherpa-onnx-offline-speaker-diarization
  bin/win32-x64/...
src/
  shared/
    types.ts                  # Meeting, MeetingDetail, Utterance, Speaker, SttSegment, SpeakerSegment
    ipc.ts                    # 채널 상수 + 요청/응답/이벤트 payload 타입
    audio.ts                  # 샘플레이트·청크 크기 등 renderer/main 공용 오디오 상수
    merge.ts                  # assignSpeakers(군소 화자 흡수 포함), mergeUtterances (순수 함수, vitest)
    format.ts                 # 타임스탬프 [hh:mm:ss], 복사용 텍스트/마크다운 조립
  main/
    index.ts                  # 창 생성, 권한 요청, ipc 등록
    log.ts                    # 운영 로그 (console 직접 호출 금지)
    audio/wavWriter.ts        # Float32 청크 → Int16 append, 종료 시 헤더 확정
    pipeline/{queue,run,normalize,whisper,diarize}.ts   # normalize는 RMS 게인 정규화(순수 TS), vad는 whisper 내장이라 별도 단계 없음
    db/{connection,migrations,meetings,utterances,speakers}.ts
    models/paths.ts           # 모델 경로 해석 (registry/download는 Phase 4)
    bin/{paths,spawn}.ts
    ipc/handlers.ts
  preload/index.ts            # window.api 타입 노출
  renderer/src/
    main.tsx, App.tsx
    worklet/pcmRecorder.js    # AudioWorkletProcessor (Vite `?url` import로 로드)
    pages/{Onboarding,Home,Record,MeetingDetail}/index.tsx   # widgets 배치만
    modules/widgets/{domain}/…    # section 단위 도메인 컴포넌트 (TranscriptSection 등)
    modules/features/{domain}/…   # 작은 도메인 컴포넌트 (RecordButton, SpeakerRenameField)
    shared/api/{domain}/index.ts  # window.api 래퍼 (유일한 window.api 접점)
    shared/components/{primitives,composites}/…
    shared/hooks/{common,domain}/…   # useRecorder, useMeetings, usePipelineProgress
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
  // Phase 3 이후에 추가한다 (미리 정의해 두지 않는다)
  // meetings.delete / meetings.rename
  // utterances.updateText / utterances.reassign
  // speakers.rename / speakers.merge
  // models.status / models.download, events.modelDownload
} as const
```

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
| `pnpm tsx scripts/setupBin.ts` | 현재 플랫폼용 실행 파일 확보(다운로드 또는 로컬 설치본 복사), 실행 권한 부여, macOS 격리 속성 제거 | `resources/bin/<platform>-<arch>/` |
| `pnpm tsx scripts/setupModels.ts` | Whisper·diarization 모델 다운로드(Range 이어받기, SHA256 검증) | `scripts/fixtures/models/` (Phase 1 전용) |

- Phase 1 스크립트는 위 두 경로를 상수로 참조한다. 앱 런타임의 모델 경로는 `app.getPath('userData')/models`로 별개이며,
  Phase 4 온보딩 다운로더가 `scripts/setupModels.ts`와 같은 레지스트리(`src/main/models/registry.ts`)를 공유한다.
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
- diarization 호출 파라미터: `--num-clusters`(참석자 수를 알면), `--cluster-threshold=0.8`(Phase 1에서 실제 회의 WAV로 확정). 최소 지속 시간은 pyannote 기본값 유지. 프로바이더는 CPU 고정(`coreml`은 훨씬 느림).
- 음량 정규화: whisper·diarization을 spawn하기 **전에** `src/main/pipeline/normalize.ts`가 녹음 WAV의 PCM에 RMS 게인을 적용한 WAV를 만들고, 두 바이너리는 그 파일을 읽는다. 원본은 정규화본과 별개로 두며 삭제 정책은 원본에만 적용된다. 파라미터는 SKILL.md 결정 표 참고.

## 앱 런타임 경로 (Phase 2)

| 대상 | 개발(`pnpm dev`) | 패키징 |
| --- | --- | --- |
| 바이너리 | `resources/bin/<platform>-<arch>/` | `process.resourcesPath/app.asar.unpacked/resources/bin/<platform>-<arch>/` |
| 모델 | `userData/models/` → 없으면 `scripts/fixtures/models/` 폴백 | `userData/models/` (Phase 4 온보딩이 채운다) |
| 녹음 WAV | `userData/recordings/<meetingId>.wav` | 같음 |
| DB | `userData/meetings.db` | 같음 |

- 경로 해석은 `src/main/bin/paths.ts`·`src/main/models/paths.ts`에서만 한다. 다른 모듈이 `app.getPath`를 직접 부르지 않는다.
- **모델 폴백은 개발 모드 전용이다.** Phase 4 온보딩 다운로더가 붙기 전까지 `pnpm tsx scripts/setupModels.ts`로 받아 둔 Phase 1 픽스처 모델을 그대로 쓰기 위한 장치이며, 패키징 빌드에서는 폴백하지 않는다.
- 시작 시 바이너리·모델이 없으면 앱은 뜨되 파이프라인 잡이 `status='error'`로 끝나고, 사용자에게 "모델이 준비되지 않았습니다" 안내를 남긴다.

## 파이프라인 잡 큐 (Phase 2)

- `src/main/pipeline/queue.ts`는 **동시성 1**의 메모리 큐다. 여러 회의를 동시에 돌리지 않는다 (`references/pitfalls.md`).
- 한 잡의 흐름: `status='processing'` → `normalize`(RMS 게인 WAV 생성) → whisper(`stt`) / diarization(`diarize`) → `merge` → `save`(트랜잭션 INSERT) → `status='done'`.
  코어가 8개 미만이면 STT와 화자 분리를 순차 실행한다.
- 정규화본은 원본 옆에 `<meetingId>.wav.norm.wav`로 만들고 whisper·diarization이 그 파일을 읽는다. 잡이 끝나면 **실패해도 지운다** — 원본에서 다시 만들 수 있는 파생물이다.
  정규화에는 별도 `PipelineStage`를 두지 않고 `stt` 0%에 묶는다. 단계를 늘리면 `src/shared/ipc.ts` 계약과 Phase 3 진행률 UI가 함께 바뀌는데, 정규화는 spawn 없이 끝나는 짧은 단계다.
- 실패하면 `status='error'`, `error_message`에 한국어 안내를 남기고 **원본 WAV는 지우지 않는다**(재시도용).
- 진행률은 각 단계 시작·종료와 whisper/sherpa의 퍼센트 로그를 `pipeline:progress`로 push한다. 마지막에 `stage='done'` 또는 `'error'`를 한 번 보낸다.
- 앱 시작 시 `status`가 `'recording'`·`'processing'`인 채로 남은 회의는 이전 실행이 비정상 종료된 것이므로 `'error'`로 정리한다. (미완료 녹음 복구는 Phase 3)
  같은 시점에 `recordings/`의 파생물(`*.norm.wav`, `*.whisper.json`)도 지운다 — 잡 중간에 앱이 죽으면 `finally`가 돌지 않아 남는다(2026-08-26 관통 검증에서 확인). 원본 `<meetingId>.wav`는 건드리지 않는다.
- **앱 인스턴스는 한 번에 하나만 띄운다.** 두 인스턴스가 같은 `userData/meetings.db`를 공유하면 나중에 뜬 인스턴스의 시작 정리가 먼저 뜬 인스턴스의 처리 중 회의를 `'error'`로 덮어쓴다. 개발 중 `pnpm dev`를 겹쳐 실행하지 않는다 (단일 인스턴스 강제는 Phase 4에서 `app.requestSingleInstanceLock`으로).

## 녹음 (renderer)

- `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })`
- `new AudioContext({ sampleRate: 16000 })` → `audioWorklet.addModule(workletUrl)` → 프로세서가 128프레임 단위로 받은 Float32를 `CHUNK_SAMPLES`(8192, 약 0.5초)씩 모아 `port.postMessage`.
- **워크릿 파일은 `src/renderer/src/worklet/pcmRecorder.js`에 두고 `import workletUrl from '@renderer/worklet/pcmRecorder.js?url'`로 로드한다.**
  `resources/` 아래에 두면 Vite 개발 서버가 서빙하지 않고 패키징 시에도 `process.resourcesPath`로 흩어져 renderer가 URL로 접근할 수 없다.
  `?url`은 개발 모드에서는 dev 서버 경로를, 빌드에서는 `out/renderer/assets/`에 복사된 경로를 준다.
  단 Vite는 작은 에셋을 `data:` URL로 인라인하는데, renderer의 CSP가 `script-src 'self'`라 인라인되면 `addModule`이 차단된다.
  `electron.vite.config.ts`의 renderer `build.assetsInlineLimit`에서 워크릿만 인라인 대상에서 빼 **항상 파일로 내보낸다**.
- 레벨 미터는 별도 `AnalyserNode`를 붙이지 않고 renderer가 받은 청크의 RMS로 계산한다 (노드를 하나 덜 만든다).
- 정지 시 `IPC.recording.stop` → main이 WAV 헤더를 확정하고 파이프라인 잡을 큐에 넣는다.
- Float32 → Int16 PCM 변환은 main의 `audio/wavWriter.ts`에서 수행 (renderer는 원본 Float32 `ArrayBuffer`만 전달).
- 샘플레이트·청크 크기 상수는 `src/shared/audio.ts`에 한 번만 정의해 renderer와 main이 함께 쓴다.
- `AudioContext`가 16kHz 요청을 무시할 수 있으므로 실제 `context.sampleRate`를 확인해 다르면 녹음을 시작하지 않고 안내한다 (`references/pitfalls.md`).

## 화면 라우트 (Phase 2)

`file://`에서도 동작해야 하므로 `createHashRouter` + `RouterProvider`를 쓴다. 라우팅 관련 코드는 `src/renderer/src/shared/routes/`에만 두고, 다른 코드는 경로 문자열을 직접 쓰지 않는다.

- `routes/paths.ts` : 경로 상수와 경로 조립 함수(`meetingDetailPath`). **컴포넌트는 여기만 import한다.**
- `routes/index.tsx` : 페이지를 물린 라우터 정의. 페이지를 import하므로, 컴포넌트가 이 파일에서 경로 상수를 가져오면 `widget → routes → page → widget` 순환 import가 된다.

| 경로 | 페이지 | 배치하는 widget |
| --- | --- | --- |
| `/` | `pages/Home` | `meeting/MeetingListSection` |
| `/record` | `pages/Record` | `recording/RecorderSection` |
| `/meetings/:meetingId` | `pages/MeetingDetail` | `meeting/TranscriptSection` |

- 온보딩(`/onboarding`)은 Phase 4에서 모델 다운로더와 함께 추가한다. 미리 만들어 두지 않는다.
- 흐름: 홈에서 "새 회의 녹음" → `/record` → 정지 → main이 잡을 큐에 넣고 `/meetings/:meetingId`로 이동 → 처리 중 상태를 보여주다가 `pipeline:progress`의 `done`을 받으면 회의록을 다시 불러온다.
- 녹음 중에 `/record`를 벗어나면(뒤로 가기·창 닫기) 녹음을 정지해 WAV 헤더를 확정하고 잡을 큐에 넣는다. 헤더가 확정되지 않은 WAV는 파이프라인이 읽지 못한다.
- Phase 2에서 진행률 **막대**는 만들지 않는다(Phase 3). 진행률 이벤트는 목록·디테일의 상태를 갱신하는 신호로만 쓴다.
