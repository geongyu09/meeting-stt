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
  bin/darwin-arm64/whisper-cli, sherpa-onnx-offline-speaker-diarization, llama-cli (+ dylib)
src/
  shared/
    types.ts                  # Meeting, MeetingDetail, Utterance, Speaker, SttSegment, SpeakerSegment
    ipc.ts                    # 채널 상수 + 요청/응답/이벤트 payload 타입
    audio.ts                  # 샘플레이트·청크 크기 등 renderer/main 공용 오디오 상수
    merge.ts                  # assignSpeakers(군소 화자 흡수 포함), mergeUtterances (순수 함수, vitest)
    format.ts                 # 타임스탬프 [hh:mm:ss], 복사용 텍스트/마크다운 조립
    progress.ts               # 단계별 퍼센트 → 전체 진행률 (가중치, 순수 함수, vitest)
  main/
    index.ts                  # 창 생성, 권한 요청, ipc 등록
    log.ts                    # 운영 로그 (console 직접 호출 금지)
    audio/wavWriter.ts        # Float32 청크 → Int16 append, 종료 시 헤더 확정
    pipeline/{queue,run,normalize,whisper,diarize}.ts   # normalize는 RMS 게인 정규화(순수 TS), vad는 whisper 내장이라 별도 단계 없음
    db/{connection,migrations,meetings,utterances,speakers,settings}.ts
    models/{registry,paths,download,recommend,service}.ts   # 레지스트리(스크립트와 공유)·경로 해석·다운로드·저사양 권장
    summary/{llama,run,paths,transcript}.ts                 # 로컬 요약 (Phase 5)
    updater.ts                # electron-updater, 기본 꺼짐 (references/distribution.md)
    bin/{paths,spawn}.ts
    ipc/handlers.ts
  preload/index.ts            # window.api 타입 노출
  renderer/src/
    main.tsx, App.tsx
    worklet/pcmRecorder.js    # AudioWorkletProcessor (Vite `?url` import로 로드)
    pages/{Onboarding,Home,Record,MeetingDetail,Settings}/index.tsx   # widgets 배치만
    shared/routes/{index.tsx,paths.ts,guards.tsx}   # 라우터·경로 상수·온보딩 진입 가드
    modules/widgets/{domain}/…    # section 단위 도메인 컴포넌트 (TranscriptSection, SettingsSection 등)
    modules/features/{domain}/…   # 작은 도메인 컴포넌트 (PipelineProgress 등)
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
  // Phase 3
  //   meetings.rename / meetings.delete
  //   utterances.updateText / utterances.reassign
  //   speakers.rename / speakers.merge
  //   settings.get / settings.update
  //   clipboard.writeText
  // Phase 4 (references/distribution.md 3·7절)
  //   models.status / models.download / models.downloadSummary, events.modelDownload
  //   update.download / update.install, events.updateAvailable
  // Phase 5
  //   summary.create, events.summary
} as const
```

### 편집 채널의 응답 규약 (Phase 3)

**회의 상세를 바꾸는 모든 뮤테이션 채널은 갱신된 `MeetingDetail`을 그대로 돌려준다** (`meetings:get`과 같은 모양).
`meetings:delete`만 예외로 아무것도 돌려주지 않는다 — 지운 회의의 상세가 없기 때문이다.

- 이유: 화자 병합·재배정처럼 여러 행이 한꺼번에 바뀌는 작업도 renderer가 응답 하나로 상태를 정확히 맞출 수 있다.
  뮤테이션마다 "무엇이 바뀌었는지" 부분 응답을 설계하거나, 뮤테이션 뒤에 `meetings:get`을 한 번 더 부르는 왕복을 만들지 않는다.
- renderer는 응답을 `useMeeting`의 상세 상태에 그대로 덮어쓴다. 낙관적 업데이트는 하지 않는다 (로컬 SQLite라 왕복이 짧다).
- 요청 payload에는 대상 식별자와 함께 `meetingId`를 항상 넣는다. 응답을 만들 때 회의를 다시 찾지 않아도 되고, 핸들러가 "이 회의의 발화/화자인지"를 검증할 수 있다.

- `clipboard:writeText`는 main의 `electron.clipboard`로 텍스트를 복사한다. renderer의 `navigator.clipboard`를 쓰지 않는다 —
  패키징 빌드의 `file://` 문서와 `setPermissionRequestHandler`(마이크 외 전부 거부)에 걸릴 여지를 없애기 위해서다. 복사할 텍스트 조립은 renderer가 `@shared/format`으로 한다.

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
- **모델 폴백은 개발 모드 전용이다.** Phase 4 온보딩 다운로더가 붙기 전까지 `pnpm tsx scripts/setupModels.ts`로 받아 둔 Phase 1 픽스처 모델을 그대로 쓰기 위한 장치이며, 패키징 빌드에서는 폴백하지 않는다.
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

- `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })`
- `new AudioContext({ sampleRate: 16000 })` → `audioWorklet.addModule(workletUrl)` → 프로세서가 128프레임 단위로 받은 Float32를 `CHUNK_SAMPLES`(8192, 약 0.5초)씩 모아 `port.postMessage`.
- **워크릿 파일은 `src/renderer/src/worklet/pcmRecorder.js`에 두고 `import workletUrl from '@renderer/worklet/pcmRecorder.js?url'`로 로드한다.**
  `resources/` 아래에 두면 Vite 개발 서버가 서빙하지 않고 패키징 시에도 `process.resourcesPath`로 흩어져 renderer가 URL로 접근할 수 없다.
  `?url`은 개발 모드에서는 dev 서버 경로를, 빌드에서는 `out/renderer/assets/`에 복사된 경로를 준다.
  단 Vite는 작은 에셋을 `data:` URL로 인라인하는데, renderer의 CSP가 `script-src 'self'`라 인라인되면 `addModule`이 차단된다.
  `electron.vite.config.ts`의 renderer `build.assetsInlineLimit`에서 워크릿만 인라인 대상에서 빼 **항상 파일로 내보낸다**.
- 레벨 미터는 별도 `AnalyserNode`를 붙이지 않고 renderer가 받은 청크의 RMS로 계산한다 (노드를 하나 덜 만든다).
- 정지 시 `IPC.recording.stop` → main이 WAV 헤더를 확정하고 파이프라인 잡을 큐에 넣는다.
  payload의 `speakerCount?`(1~`MAX_SPEAKER_COUNT`=20, 정수)는 `meetings.speaker_count`에 저장돼 화자 분리의 `num-clusters`가 된다.
  녹음 화면의 "참석자 수" 숫자 입력은 녹음 전·중 언제든 바꿀 수 있고 정지 시점의 값을 보낸다. 비우면 임계값 폴백이며, 그 경우 화자가 과분할될 수 있다고 입력란 옆에 안내한다.
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
| `/settings` | `pages/Settings` | `setting/SettingsSection`, `model/ModelDownloadSection`, `model/SummaryModelSection` |
| `/onboarding` | `pages/Onboarding` | `model/ModelDownloadSection` |

- `/settings`는 Phase 3에서 원본 WAV 보관 옵션과 함께 추가했다. Phase 4에서 업데이트 확인 옵션(`SettingsSection`),
  음성 인식 모델 변경(`ModelDownloadSection`, 온보딩과 같은 위젯), 요약 모델 다운로드(`SummaryModelSection`)를 붙였다.
  이후 발열·팬 소음을 줄이는 '조용히 처리' 옵션(`SettingsSection`, `pipeline.quiet`)을 붙였다.
- 온보딩(`/onboarding`)은 Phase 4에서 추가했다. **진입 가드**는 `shared/routes/guards.tsx`의 `RequireModels`가 맡는다 —
  홈·녹음·상세·설정을 자식으로 갖는 경로 없는 레이아웃 라우트로, `models:status`의 `isReady`가 거짓이면 `/onboarding`으로 보낸다.
  온보딩 페이지 자체는 가드 밖에 있고, 다운로드가 끝나면 홈으로 이동한다. 가드는 레이아웃이 처음 마운트될 때 한 번만 조회한다
  (모델은 온보딩 밖에서 사라지지 않는다).
- 홈 상단의 `features/update/UpdateBanner`는 `update:available` 이벤트를 받았을 때만 나타난다 (`references/distribution.md` 7절).
- 흐름: 홈에서 "새 회의 녹음" → `/record` → 정지 → main이 잡을 큐에 넣고 `/meetings/:meetingId`로 이동 → 처리 중 상태를 보여주다가 `pipeline:progress`의 `done`을 받으면 회의록을 다시 불러온다.
- 녹음 중에 `/record`를 벗어나면(뒤로 가기·창 닫기) 녹음을 정지해 WAV 헤더를 확정하고 잡을 큐에 넣는다. 헤더가 확정되지 않은 WAV는 파이프라인이 읽지 못한다.
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
