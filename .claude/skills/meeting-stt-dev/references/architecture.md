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
│ pipeline/ 잡 큐(순차) → vad → whisper → diarize → merge     │
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
  pipeline.ts                 # wav → whisper → diarize → merge → 콘솔/JSON 출력
  fixtures/                   # 테스트용 한국어 회의 WAV (git 제외)
resources/
  bin/darwin-arm64/whisper-cli, sherpa-onnx-offline-speaker-diarization
  bin/win32-x64/...
  worklet/pcm-recorder.js     # AudioWorkletProcessor (renderer가 로드)
src/
  shared/
    types.ts                  # Meeting, Utterance, Speaker, SttSegment, SpeakerSegment
    ipc.ts                    # 채널 상수 + 요청/응답/이벤트 payload 타입
    merge.ts                  # assignSpeakers, mergeUtterances (순수 함수, vitest)
    format.ts                 # 타임스탬프 [hh:mm:ss], 복사용 텍스트/마크다운 조립
  main/
    index.ts                  # 창 생성, 권한 요청, ipc 등록
    audio/wavWriter.ts        # 청크 append + 헤더 finalize
    pipeline/{queue,vad,whisper,diarize,run}.ts
    db/{connection,schema,migrations,meetings,utterances,speakers}.ts
    models/{registry,download,paths}.ts
    bin/{paths,spawn}.ts
    ipc/handlers.ts
  preload/index.ts            # window.api 타입 노출
  renderer/src/
    main.tsx, App.tsx
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
  recording: { start: 'recording:start', chunk: 'recording:chunk', stop: 'recording:stop' },
  meetings:  { list: 'meetings:list', get: 'meetings:get', delete: 'meetings:delete', rename: 'meetings:rename' },
  utterances:{ updateText: 'utterances:updateText', reassign: 'utterances:reassignSpeaker' },
  speakers:  { rename: 'speakers:rename', merge: 'speakers:merge' },
  models:    { status: 'models:status', download: 'models:download' },
  events:    { progress: 'pipeline:progress', modelDownload: 'models:downloadProgress' }
} as const
```

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
- diarization 호출 파라미터: `--num-clusters`(참석자 수를 알면), `--cluster-threshold`(Phase 1에서 튜닝). 최소 지속 시간은 pyannote 기본값 유지.

## 녹음 (renderer)

- `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })`
- `new AudioContext({ sampleRate: 16000 })` → `audioWorklet.addModule('worklet/pcm-recorder.js')` → 프로세서가 128프레임 단위로 받은 Float32를 4096~16384 샘플로 모아 `port.postMessage`.
- 레벨 미터는 `AnalyserNode`. 정지 시 `IPC.recording.stop` → main이 WAV 헤더를 확정하고 파이프라인 잡을 큐에 넣는다.
- Float32 → Int16 PCM 변환은 main의 wav-writer에서 수행 (renderer는 원본 Float32만 전달).
