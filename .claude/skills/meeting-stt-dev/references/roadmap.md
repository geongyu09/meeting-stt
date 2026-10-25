# 로드맵과 완료 기준 (Definition of Done)

각 Phase는 아래 체크리스트를 **모두** 만족해야 다음 Phase로 넘어간다. 진행 상황은 이 파일의 체크박스를 갱신해 기록한다.

## Phase 0: 개발 환경 정리
- [x] `pnpm install` 성공 (`pnpm.onlyBuiltDependencies`에 `electron`, `esbuild`, `electron-winstaller`, `better-sqlite3` 등록, `electron-builder install-app-deps` 동작 확인)
- [x] `package.json` scripts 내부 호출을 `pnpm run`으로 통일, README 설치 안내도 pnpm 기준으로 수정, `packageManager` 필드·`.npmrc`(hoisted) 추가
- [x] `vitest`(단위 테스트)·`tsx`(스크립트 실행) devDependency 추가, `pnpm test` 스크립트 등록
- [x] `pnpm dev`로 스캐폴드 창이 뜨는지 확인 (`pnpm build`·`pnpm lint`도 통과)
- [x] `.gitignore`에 `scripts/fixtures/`, `*.wav`, 모델 파일(`*.bin`, `*.onnx`), `resources/bin/` 추가
- [x] `electron-builder.yml`: `appId`, `NSMicrophoneUsageDescription` 한국어 문구, 불필요한 카메라/폴더 권한 문구 제거
- [x] `build/entitlements.mac.plist`에 `com.apple.security.device.audio-input` 추가 (하드닝 런타임에서 마이크 접근 필수)

## Phase 1: 파이프라인 검증 (스크립트, UI 없음)
- [x] `scripts/setupBin.ts`: macOS(arm64) 용 `whisper-cli`(Metal 빌드)와 `sherpa-onnx-offline-speaker-diarization`을 `resources/bin/darwin-arm64/`에 배치 (git 커밋 안 함, `references/architecture.md` 참고)
- [x] `scripts/setupModels.ts`: `ggml-large-v3-turbo-q5_0.bin`, `sherpa-onnx-pyannote-segmentation-3-0`, `3dspeaker_speech_eres2net_base_sv`, Silero VAD를 `scripts/fixtures/models/`에 다운로드 (Range 이어받기 + SHA256)
- [x] 합성 픽스처: `scripts/makeFixture.ts`가 macOS `say`로 2~3인 한국어 대화 WAV를 만든다 → **배관(경로·파싱·병합) 검증 전용**
- [x] 실제 한국어 회의 WAV 픽스처 확보 → 품질·`cluster_threshold` 튜닝은 이걸로만 판단한다 (2026-08-26, 음성 메모 71분 발표·Q&A 녹음 `scripts/fixtures/audio/geumtoro*.wav`, git 제외)
- [x] 실제 녹음으로 재측정한 결론 반영: 음량 정규화 단계 추가(`src/main/pipeline/normalize.ts`), `cluster-threshold` 0.6 → 0.8, 군소 화자 흡수(`assignSpeakers`) → `docs/phase1-results.md`
      → **2026-08-26 일부 뒤집힘**: 임계값 군집은 71분 전체·앱 26분 회의에서 화자가 115·129개로 늘어난다(6·7절). 참석자 수 `num-clusters`가 기본 경로로 바뀜
- [x] `scripts/pipeline.ts`: WAV → (VAD) → whisper JSON → diarization 출력 → `@meeting-stt/core/merge` → 회의록 텍스트 출력
- [x] 병합·포맷(현 `packages/core/src/`)·`main/pipeline/{whisper,diarize}.ts` 단위 테스트 통과 (`pnpm test`, 45개)
- [x] 튜닝 결과 기록: 모델별(turbo-q5 / large-v3 / small) 처리 시간·체감 정확도, `cluster_threshold` 값, VAD 사용 유무 차이, 단어 타임스탬프 옵션 효과 → `docs/phase1-results.md`
- [x] 결론: 기본 모델·파라미터 확정 후 SKILL.md 결정 표 갱신 (실제 회의 WAV로 재확인 완료)

## Phase 2: 앱 골격 (관통)
- [x] `src/shared/{types,ipc}.ts` 정의, preload에 타입 노출
- [x] 녹음: AudioWorklet PCM 수집 → IPC 청크 전송 → main WAV append → 정지 시 헤더 확정 (워크릿은 `data:` URL 인라인 금지 — `electron.vite.config.ts`)
- [x] macOS 마이크 권한 요청 및 거부 시 안내 (`recording:requestPermission` → 거부 시 RecorderSection이 한국어로 안내)
- [x] SQLite 초기화·마이그레이션, meetings/utterances/speakers 리포지토리 (`pnpm dev`에서 `userData/meetings.db` 생성 확인)
- [x] 파이프라인 잡 큐(순차) + Phase 1 로직 이식(`normalize` → whisper/diarize → merge), 완료 시 `status='done'`, 실패 시 `'error'` (정규화본은 잡이 끝나면 삭제, 원본 WAV는 재시도용으로 보관)
- [x] 홈(리스트, 상태 표시) → 디테일(발화 리스트) 라우팅 (해시 라우터, `pipeline:progress` 수신 시 목록·상세 자동 갱신, 위젯 통합 테스트 포함)
- [x] 완료 기준: 앱에서 녹음 → 정지 → 잠시 후 홈에서 회의록이 열린다 (**2026-09-18 사용자 수동 확인 완료**) → **Phase 2 종료**

## Phase 3: 편집·복사·화자 관리

계약(IPC 채널·응답 규약·편집 UI 규칙)은 `references/architecture.md`, SQL과 설정 키는 `references/data-model.md`에 먼저 정의해 두었다.
남은 수동 확인·커밋 정리·Phase 4 인계 사항은 `docs/phase3-handoff.md`에 모아 두었다 (전부 처리되면 지운다).

- [x] IPC 계약: `meetings.rename/delete`, `utterances.updateText/reassign`, `speakers.rename/merge`, `settings.get/update`, `clipboard.writeText` (뮤테이션 응답은 갱신된 `MeetingDetail`)
- [x] main: `db/settings.ts` 신설, `db/{meetings,utterances,speakers}.ts`에 편집 함수 추가, 핸들러 payload 검증(길이 제한·회의 소속 확인), `audio/recordings.ts`로 원본 삭제 일원화
- [x] 발화 인라인 편집 (blur·Enter 확정, Escape 취소, 빈 값 저장 금지) — `shared/components/composites/InlineEditableText`
- [x] 화자 관리: 이름 변경(전체 반영) / 발화별 다른 화자로 재배정(`<select>`) / 화자 병합(2단계 인라인 확인)
- [x] 전체 복사(플레인/마크다운), 발화 단위 복사 — main `electron.clipboard` 경유. 발화 하나만 복사해도 화자 번호가 유지된다
- [x] 처리 진행률 표시 — `src/shared/progress.ts`(가중치·단조 증가, 단위 테스트 9개) + `modules/features/pipeline/PipelineProgress`를 홈 카드·상세가 공유
- [x] 회의 제목 변경, 삭제(2단계 인라인 확인 + 원본 WAV 삭제)
- [x] 원본 WAV 보관 설정(`audio.keep`, 기본 삭제) — `/settings` 화면, 잡 성공 시 적용
- [x] 참석자 수 입력 → `num-clusters` (녹음 화면 숫자 입력, `recording:stop` payload `speakerCount`, `meetings.speaker_count`, 참석자 수가 있으면 군소 화자 흡수 생략) — 임계값 군집이 긴 녹음에서 파탄나는 문제 대응 (`docs/phase1-results.md` 6·7절)
- [x] 통합 테스트: TranscriptSection 19개, SettingsSection 4개, MeetingListSection 7개 (`pnpm test` 139개 통과)
- [x] 완료 기준: 회의록을 열어 텍스트·화자 이름·제목을 고치고 복사한 결과가 앱을 다시 켜도 그대로 남는다 (**2026-09-18 사용자 수동 확인 완료**) → **Phase 3 종료**

## Phase 4: 배포 품질

결정과 계약은 `references/distribution.md`가 SSOT다.

- [x] 모델 카탈로그(`@meeting-stt/models/desktop`, 스크립트와 공유) + 다운로더(Range 이어받기, SHA256, `tar -xf` 아카이브 해제, 동시성 1)
- [x] 온보딩: 모델 선택(권장 turbo-q5 / 고품질 large-v3 / 저사양 small, 권장값 미리 선택) → 총 용량 → 항목별 진행률 → 완료 시 홈
      (`modules/widgets/model/ModelDownloadSection`, `pages/Onboarding`, `shared/routes/guards.tsx`의 `RequireModels` 가드)
- [x] "네트워크는 모델 다운로드 한 번뿐" 문구 노출 (온보딩·설정의 `ModelDownloadSection`)
- [x] 저사양 감지(`recommend.ts`, 단위 테스트) + 저사양 장비에서 다른 모델을 고르면 "시간이 오래 걸릴 수 있다" 안내
- [x] `/settings`에서 음성 인식 모델 변경(같은 위젯 재사용), 요약 모델 다운로드(`SummaryModelSection`), 업데이트 확인 옵션
- [x] macOS 배포용 whisper 정적 빌드(`scripts/buildWhisper.ts`, v1.8.4, Metal 내장), 서명·notarization 설정(옵트인)
- [x] electron-updater — 기본 꺼짐, `update.check` 설정으로 켬, 새 버전은 알리기만(`features/update/UpdateBanner`) → 사용자가 받기·설치
- [x] GitHub Actions: macOS(arm64) 검증 빌드만 (릴리스는 로컬 `pnpm run build:mac:release` + 자산 개별 업로드, `references/distribution.md` 6·8절)
- [x] 단일 인스턴스 잠금(`app.requestSingleInstanceLock`)
- [x] 설정 '조용히 처리'(`pipeline.quiet`) — 화자 분리 스레드를 성능 코어의 절반으로, STT와 순차 실행 (`references/architecture.md` 가속·스레드 정책)
- [x] 통합 테스트: ModelDownloadSection, SummaryModelSection, UpdateBanner, SettingsSection(업데이트 옵션)
- [x] `electron-builder.yml`의 `publish.owner` 교체(`geongyu09`), 공증 자격 증명 등록(`notarytool` 키체인 프로필 `meeting-stt-notary`, 2026-09-18)
- [x] 첫 릴리스 `v0.1.0` 게시 (2026-09-18) — 공증·스테이플 확인, dmg만 업로드 성공. 다음 릴리스에는 자동 업데이트용 zip이 필요하다 (`references/distribution.md` 6절)
- [x] 업데이트 배너 오탐 수정 — 판정을 `isUpdateAvailable`로 바꿨다. `checkForUpdates()` 결과에서 알릴 버전을 고르는 부분만
      `src/main/updateResult.ts`의 순수 함수로 떼어 단위 테스트를 붙였다 (electron-updater를 import하는 파일은 테스트할 수 없다).
      v0.1.1에 포함 (2026-09-18, `references/distribution.md` 7절 · `references/pitfalls.md`)
- [x] `v0.1.1` 게시 (2026-09-18) — **zip 포함**. 빌드·공증은 `build:mac:release`로 끝내고 자산은 하나씩 올렸다
      (zip 91초·dmg 101초, 재시도 0회). 동봉 바이너리 17개 서명·공증·스테이플 확인 (`references/distribution.md` 6절)
- [x] 완료 기준: `userData/models/`가 빈 상태로 앱을 켜면 온보딩이 뜨고, 다운로드가 끝나면 홈에서 녹음할 수 있다
      (**2026-09-18 사용자 수동 확인 완료**. 개발 모드는 픽스처 폴백 때문에 `userData/models/`와 `scripts/fixtures/models/`를
      둘 다 치워야 재현된다 — `src/main/models/paths.ts`) → **Phase 4 종료**

## Phase 5: 확장

사용자 지시로 Phase 3·4보다 먼저 착수했다(2026-08-26). 로드맵 순서를 건너뛴 예외라 여기 기록해 둔다.
설계·계약은 `references/architecture.md`의 "로컬 LLM 요약 (Phase 5)" 절이 기준.

### 5-1. llama.cpp 기반 로컬 요약 → `meetings.summary`

끝난 것:

- [x] `llama-cli` 호출 방식 확정 — `-sysf`/`-f`/`-o` 파일 입출력 + `-st --no-escape`, `-o` 출력에서 `\nAssistant:\n` 뒤만 취함
- [x] 요약 모델 확정 — `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (Apache-2.0, 비사고형). **필수 모델 아님** — 없으면 요약만 막히고 STT는 그대로
- [x] 순수 로직 `src/shared/summary.ts` (구간 분할·프롬프트 조립·출력 정리) + 단위 테스트
- [x] main `src/main/summary/{llama,run,paths,transcript}.ts` — map-reduce, 임시 파일은 잡이 끝나면 실패해도 삭제
- [x] 잡 큐 통합 — `pipeline/queue.ts`를 `{ kind: 'pipeline' | 'summary' }`로 일반화(동시성 1 유지). 요약 실패는 회의 상태를 건드리지 않음
- [x] IPC 계약 `summary:create` + `summary:progress`, preload·renderer api·`useSummary` 훅
- [x] `modules/widgets/meeting/SummarySection` + 통합 테스트 10개, `/meetings/:meetingId`에 배치
- [x] `scripts/summarize.ts` 검증 스크립트, `setupBin.ts`(llama-cli), `setupModels.ts --summary`
- [x] 실제 71분 회의록(40,089자 / 28,004토큰)으로 측정 — 5구간 map + reduce
- [x] 결함 두 개 수정 후 재측정 — 최대 생성 토큰 900 → 1200(최종 요약이 문장 중간에서 잘렸음),
      익명 라벨(`화자 7`)을 담당자로 쓰지 말라는 지시 추가. **324초 → 240초**, 잘림·라벨 나열 모두 사라짐

- [x] `docs/phase5-results.md` — 측정치와 확인된 함정 기록
- [x] `references/pitfalls.md`·`data-model.md`에 Phase 5 절 추가
- [x] 포매팅 경고 정리 (`pnpm exec prettier --check .` 통과)
- [x] **온보딩과의 연결 결정** — 요약 모델은 온보딩에서 받지 않고 `/settings`의 `SummaryModelSection`에서 따로 받는다.
      `SummarySection`은 모델이 없으면 버튼을 막고 설정 링크를 보여준다 (`references/distribution.md` 1절)

- [x] **STT 오인식을 요약 단계에서 고치지 않기로 결정** — 원문 회의록에 이미 "증본 문서"(changeset)·"타볼"(tarball)로
      적혀 있고 요약 모델은 충실히 옮긴 것뿐이다. 교정 지시는 "없는 내용을 만들지 마라"와 충돌해 이름·숫자까지 바꾼다.
      Phase 3 인라인 편집으로 회의록을 고친 뒤 "다시 요약"하는 경로를 쓴다 (`docs/phase5-results.md`)

남은 것:
- [x] 회의별 용어 사전(whisper `--prompt`) 검토 — **2026-09-24 측정 완료** (`docs/phase5-refine-results.md`).
      `--prompt`만으로는 첫 30초 창에서 효과가 끝난다. `--carry-initial-prompt`를 함께 주면 71분 회의 오인식 39곳 중 18곳
      (GitHub 11곳 전부, pnpm, 모노레포)을 고치고 없는 용어는 뚜렷이 만들지 않았다. 반복 환각도 1,103초 → 18초로 줄었다.
      앱 적용 여부와 용어 입력 위치는 사용자 확인 대기 (5-4 앱 항목) → **2026-10-01 전역 사전으로 적용 결정** (아래 "인식 단계 용어 프롬프트")
- [x] **앱 동봉 whisper-cli 반복 환각 원인 조사** — 71분 녹음에서 1,103초가 반복 문장으로 채워진다(Homebrew 빌드는 27초).
      **2026-09-25 `-mc 0`으로 대응** (사용자 결정 A: 모든 모델에 적용). 금토로 71분 1,034초 → 25초, large-v3 102분 2,338초 → 2초 (`docs/stt-tuning-results.md`)
- [x] **`pnpm dev`로 실제 앱에서 관통 확인** — 회의 상세에서 "요약 만들기" → 진행률 → 본문 표시 → 앱 재시작 후에도 남아 있는지
      (**2026-09-18 사용자 수동 확인 완료**)
- [ ] **동봉 dylib의 서명·공증 확인 — 자격 증명 대기.** rpath가 `@loader_path`인 것과 내려받은 상태가
      adhoc(linker-signed)인 것은 확인했다(`docs/phase5-results.md`). `asarUnpack: resources/**`도 걸려 있다.
      electron-builder가 Developer ID로 재서명한 결과 확인은 인증서가 있어야 가능하다 (`references/distribution.md` 6절)
- [ ] 저사양 폴백 모델 검토 (Qwen3-1.7B 등) — Phase 4 저사양 안내와 함께

### 5-2. 시스템 오디오 캡처 (2026-09-26 착수)

온라인 회의(Zoom·Meet 등) 상대방 목소리를 전사하기 위해 스피커로 나가는 소리를 마이크와 함께 녹음한다.
사용자 결정: **앱 밖에서 해야 하는 설정(가상 오디오 드라이버 설치·집계 장치 구성)은 두지 않는다.** 설계는 `references/architecture.md` "시스템 오디오 캡처" 절.

**동봉 도구**
- [x] `native/systemAudioTap/main.swift` — Core Audio Taps(macOS 14.2+)로 전역 mono 탭 + 비공개 집계 장치 → `AVAudioConverter`로 16kHz mono Float32 → stdout. 벽시계 기준으로 빈 구간을 0으로 채워 연속 스트림을 보장하고, 기본 출력 장치가 바뀌면 다시 만든다. stdin이 닫히거나 SIGTERM이면 정리 후 종료
- [x] `scripts/setupBin.ts`가 `swiftc -O -target arm64-apple-macos14.2`로 빌드해 `resources/bin/darwin-arm64/systemAudioTap`에 둔다. `swiftc`가 없으면 경고만 남기고 넘어간다 (이 기능만 막힌다)
- [x] `src/main/bin/paths.ts`에 `systemAudioTapBinPath()`
- [x] `electron-builder.yml` `extendInfo`에 `NSAudioCaptureUsageDescription` 한국어 문구
- [ ] 서명·공증 빌드에서 동봉 도구가 함께 서명되는지 확인 — 자격 증명 대기 (5-1의 dylib 항목과 같은 이유)

**main**
- [x] `src/main/audio/systemAudio.ts` — 도구 spawn·stdout 누적·정지, 1초 프로브(권한 창 유도·동작 확인)
- [x] `src/main/audio/systemAudioMix.ts` — 순수 함수: 시스템 샘플 FIFO(부족하면 0 채움, 밀리면 오래된 것 버림)와 두 스트림 합산(클리핑). vitest
- [x] `src/main/audio/session.ts` — 시작 시 켜져 있으면 도구를 띄우고, 청크마다 마이크 + 시스템 샘플을 섞어 WAV·레벨·라이브 받아쓰기에 넘긴다. 도구가 없거나 실패하면 마이크만 녹음하고 `systemAudio.errorMessage`로 알린다. 정지 시 남은 시스템 샘플을 쓰고 도구를 끝낸다
- [x] `src/main/db/settings.ts` — `audio.systemCapture` 읽기·쓰기 (`AppSettings` 밖)

**계약·화면**
- [x] `src/shared/ipc.ts` — `recording.setSystemAudio`(invoke, `{ isEnabled }` → `GetRecordingStateResponse`), `RecordingStateEvent.systemAudio: { isEnabled, errorMessage? }`
- [x] preload `window.api.recording.setSystemAudio`, renderer `setSystemAudioApi`, `useRecordingState`가 `systemAudio`를 돌려준다
- [x] `RecorderSection`에 스위치 행 "온라인 회의 소리 함께 녹음" + 이어폰 권장 안내 + 실패 문구. 위젯 패널은 바꾸지 않는다
- [x] 사전 `recording.systemAudio.*`, `main.recording.systemAudio*` (ko·en)

**완료 기준**
- [ ] `pnpm dev`에서 스위치를 켜면 macOS "시스템 오디오 녹음" 권한 창이 뜨고, Zoom·Meet 또는 브라우저 재생 소리가 이어폰을 낀 채로 회의록에 들어간다 (사용자 수동 확인)
- [ ] 스피커로 들을 때 마이크에 되돌아온 소리와 겹쳐도 STT가 크게 나빠지지 않는지 확인. 나쁘면 "이어폰 권장"을 경고로 올린다

### 5-3. 녹음 위젯 패널 (메뉴바·전역 단축키 포함)

사용자 요청으로 5-2보다 먼저 착수한다 (2026-09-18). 5-1처럼 로드맵 순서를 건너뛴 예외이므로 여기 기록해 둔다.
설계·근거는 `references/architecture.md`의 "녹음 위젯 패널" 절, 함정은 `references/pitfalls.md`의 같은 이름 절.

**계약 변경 (먼저 한다)**
- [x] `src/shared/ipc.ts`: `recording.state` / `recording.control` / `recording.setSpeakerCount` / `recording.reportError`(모두 invoke), `events.recordingState` / `events.recordingCommand`, `widget.setVisible` 추가 (채널 문자열 표는 `references/architecture.md` IPC 규약 절)
- [x] `StopRecordingRequest`에서 `speakerCount` 제거 — 참석자 수는 main 세션이 단일 출처가 된다
- [x] `AppSettings`에 `isWidgetEnabled`(`widget.enabled`, 기본 켜짐) 추가
- [x] 청크 RMS 계산을 `src/renderer`에서 `src/shared/audio.ts`로 옮기고 vitest 추가 (main이 레벨을 계산해 브로드캐스트)

**main**
- [x] `src/main/audio/session.ts`에 녹음 세션 상태(진행 중 회의·`startedAt`·참석자 수·마지막 레벨)와 상태 변화 브로드캐스트 추가
- [x] `src/main/windows/{main,widget,tray,shortcuts}.ts` 분리 — `index.ts`에서 창 생성 코드를 옮긴다
- [x] 메인 창 참조 보관 → `app.on('activate')` 재생성 조건과 `second-instance` 포커스를 메인 창 기준으로 수정
- [x] 위젯 패널 창: frameless·`type: 'panel'`·alwaysOnTop·`backgroundThrottling: false`·vibrancy, `workArea` 우측 배치, 위치 저장/복원(화면 밖이면 폐기)
- [x] Tray: `resources/trayTemplate.png`(+`@2x`), 녹음 중에만 1초 타이머로 `setTitle('● mm:ss')`, 메뉴 4개
- [x] `globalShortcut` `⌥⌘R`(녹음 토글)·`⌥⌘W`(패널 토글), 등록 실패는 경고 로그만, `will-quit`에서 해제
- [x] `before-quit`에서 진행 중 녹음의 WAV 헤더 확정 + 잡 큐 투입 (라우트 이동으로 정지하던 경로가 사라졌다)

**renderer**
- [x] `pages/Widget` + `modules/widgets/recording/WidgetPanelSection` — 녹음중 점·경과 시간·레벨 미터·참석자 수 입력·시작/정지
- [x] `/widget` 라우트를 `RequireModels` 가드 **밖**에 등록, 모델 미준비 시 시작 버튼 차단 + 안내
- [x] `useRecorder`를 위젯 전용으로 정리 — 언마운트 시 자동 정지 제거, `recording:command` 구독 추가
- [x] `useRecordingState` 훅(상태 구독 + `startedAt` 기반 경과 시간) 신설, `RecorderSection`은 명령 전송·상태 구독으로 전환
- [x] `RecorderSection`·`WidgetPanelSection`의 참석자 수 입력을 `recording:setSpeakerCount`로 동기화
- [x] 메인 창이 `stoppedMeetingId`를 받으면 회의 상세로 이동
- [x] `SettingsSection`에 위젯 표시 토글 추가
- [x] 위젯 재질을 `vibrancy: 'popover'` + `visualEffectState: 'active'`로 교체 (포커스 시 색 깨짐 수정, 2026-09-24)
- [x] 설정: 위젯 반투명 on/off·불투명도 슬라이더, 전역 단축키 두 개 변경 (`shortcut.*`, `widget.fade*`, `shortcuts:setSuspended`)

**검증**
- [x] 위젯 통합 테스트(시작/정지, 경과 시간, 모델 미준비 차단)와 `RecorderSection` 통합 테스트(명령 전송·상태 구독·참석자 수 동기화).
      훅은 단위 테스트하지 않는다 (`.claude/rules/test-strategy.md`)
- [x] `pnpm test`(199개) / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과 (2026-09-18)
- [ ] `pnpm dev` 실제 확인 — **설치된 v0.1.0 앱이 단일 인스턴스 잠금을 쥐고 있으면 dev 인스턴스가 즉시 종료된다.
      확인 전에 설치본을 종료할 것.** — 메인 창을 닫거나 다른 화면으로 이동해도 녹음 유지, 전체화면 앱 위에 패널 표시,
      단축키로 시작·정지, 메뉴바 시간 갱신, 정지 후 상세 이동, 외장 모니터 분리 후 패널 위치 복원
- [ ] 패널을 숨긴 채로 장시간(10분 이상) 녹음해 throttling으로 청크가 밀리지 않는지 확인 (`backgroundThrottling: false` 검증)

### 5-4. LLM 회의록 교정 (수정 제안)

사용자 요청으로 착수한다 (2026-09-24). 5-3이 끝나기 전에 시작하는 예외이므로 여기 기록해 둔다.
5-1의 "STT 오인식을 요약 단계에서 고치지 않는다" 결정은 **요약과 교정을 한 번에 하는 것**에 대한 판단이다.
교정은 요약과 분리된 별도 단계로 두고, 그 결정이 지적한 두 위험(없는 내용 생성, 정답 정보 부재)을 아래 방식으로 막는다.

- ~~파이프라인 자동 실행이 아니라 디테일 화면의 **버튼으로 요청**한다~~ → **2026-09-25 사용자 결정: 파이프라인이 회의록을 저장한 뒤 자동으로 돌린다.**
  회의록은 여전히 교정 없이도 `done`이고(교정은 별도 잡), 실패해도 상태·본문을 건드리지 않는다
- ~~`utterances.text`를 덮어쓰지 않는다. **발화별 수정 제안**을 만들고 사용자가 수락·거절한다~~ → **2026-09-25 사용자 결정: 통과한 쌍을 바로 본문에 반영한다.**
  판정 정밀도가 52%라 오탐도 들어가므로 고친 쌍 목록을 상세에 남기고, 잘못 고친 곳은 발화 인라인 편집으로 되돌린다
- **용어 사전이 필수다.** 정답 후보 없이는 고칠 근거가 없다 (검증 1·2). 라틴 문자 용어는 `용어 = 읽기1, 읽기2`로 한글 읽기를 함께 받는다.
  용어가 없거나 LLM이 준비되지 않은 회의는 자동 교정을 조용히 건너뛴다
- **LLM은 문장을 쓰지 않는다.** 코드가 자모 발음 유사도로 치환 후보를 만들고(`src/shared/phonetic.ts`, 하한 0.55),
  LLM은 후보마다 "그 자리에서 뜻이 통하는가"를 O/X로만 답한다. 출력 형식은 GBNF 문법(`--grammar-file`)으로 고정하고, 치환은 코드가 한다

**검증 (Phase 1 방식) — 2026-09-24 완료, `docs/phase5-refine-results.md`**
- [x] `scripts/refine.ts` + 순수 로직 `src/shared/{refine,phonetic}.ts`와 단위 테스트
- [x] 10분·71분 실녹음 회의록으로 측정 — 발화 다시 쓰기는 정답 0개(폐기). 후보+판정 방식은 71분 회의 **38초**,
      정밀도 20%(코드만) → **52%**, 판정이 정답 후보를 하나도 떨어뜨리지 않음
- [x] 결론(측정 시점): 자동 적용은 불가, **사용자가 수락하는 제안**으로만 쓴다. 같은 쌍이 여러 곳에서 반복되므로(기터브→GitHub 8곳)
      제안은 **쌍(from → to) 단위로 묶어** 한 번에 수락·거절하게 한다.
      → **2026-09-25 사용자 결정으로 뒤집었다**: 수락 단계 없이 자동 반영한다. 정밀도 한계는 그대로이므로 고친 목록을 남겨 되돌릴 수 있게 한다

**앱 — 2026-09-25 사용자 결정으로 착수. 설계는 `architecture.md` "회의록 교정"·`data-model.md` "교정 제안 저장"**

사용자 결정(2026-09-25): **교정(후처리) 단계로 간다.** 용어 사전을 인식 단계(whisper `--prompt --carry-initial-prompt`)에 넣는
안은 채택하지 않는다 — 사용자가 실제 회의를 돌려 봤을 때 인식 자체의 오인식이 두드러지지 않아 파이프라인을 바꿀 이유가 없었고,
남는 오인식(카볼·대포처럼 다른 소리로 들은 말)은 어차피 교정 단계가 맡아야 한다. 인식 단계 안은 뒤의 후속 후보로만 남긴다.
~~이 결정으로 **회의별 용어의 입력 위치는 상세 화면의 교정 패널**이 된다~~ → 같은 날 두 번째 결정으로 **회의별 용어 층을 폐기**했다. 근거는 전역 용어 사전뿐이다.
- [x] ~~**용어 사전은 전역 + 회의별 두 층** (2026-09-24 사용자 결정)~~ → **전역 한 층** (2026-09-25 사용자 결정, 회의별 층 폐기).
      앱에 고정 목록을 넣지 않는다 — 회의마다 용어가 달라 고정 목록은 모든 회의를 한 분야로 끌고 간다 (`docs/phase5-results.md`)
- [x] **전역 용어는 설정의 팀 소개로 LLM이 초안을 만들고 사용자가 고쳐 저장한다** (2026-09-24 사용자 결정).
      완전 자동은 폐기 — 모델 초안에 일반어·틀린 읽기가 섞여 그대로 쓰면 오탐이 늘어난다 (`docs/phase5-refine-results.md` "팀 소개로 용어 초안 만들기").
      설계: `data-model.md` settings `glossary.*`, `architecture.md` "용어 사전 (Phase 5-4)"
- [x] 계약: `GlossarySettings` 타입, settings 키 `glossary.team`·`glossary.terms`, IPC `glossary:get`·`glossary:update`·`glossary:draft`, 큐 `kind: 'glossary'`
- [x] 순수 로직 `src/shared/glossary.ts`(초안 프롬프트·GBNF 문법·출력 파싱·약어 읽기·병합·검증) + vitest
- [x] main: `src/main/glossary/draft.ts`(llama-cli 실행), `db/settings.ts` 읽기·쓰기, 핸들러
- [x] renderer: 설정 "용어 사전" 카테고리(`setting/GlossarySection`) — 팀 소개 입력, 초안 만들기, 용어 목록 편집·저장
- [x] 검수한 읽기 사전 `@meeting-stt/core/termReadings`로 초안의 단어 읽기 덮어쓰기 (2026-09-24, `architecture.md` "용어 사전")
- [ ] **`pnpm dev`로 실제 앱에서 확인** — 팀 소개 입력 → 초안 → 편집 → 저장 → 재시작 후 유지
- [x] ~~회의별 용어 층 — 상세 화면 교정 패널의 입력칸, `meetings.glossary_terms`에 저장~~ → 마이그레이션 4에서 컬럼 삭제 (2026-09-25)
- [x] 결과 저장 스키마 `meetings.refine_applied`·`refined_at`(마이그레이션 4), IPC `refine:run`(수동 재실행, 큐 예약) + `refine:progress`(push), 큐 `kind: 'refine'`.
      `refine:resolve`·`refine:discard`는 제거 (2026-09-25)
- [x] 파이프라인 잡이 `done` 뒤 `scheduleAutoRefine` — 전역 용어가 있고 LLM이 준비됐을 때만 교정 잡을 이어 넣는다 (2026-09-25)
- [x] 순수 로직: 쌍 적용(`applyRefinePairs`)·쌍 묶기(`groupRefinePairs`)·결과 읽기(`readRefinePairs`) + vitest (2026-09-25)
- [x] main `src/main/refine/run.ts` — `createLlmClient()`로 읽기·판정을 돌린다. 외부 공급자는 GBNF 대신 형식 지시문 (2026-09-25)
- [x] renderer: `api/refine`, `useRefine`·`useGlossary` 훅, `features/refine/RefinePanel`(고친 쌍 목록·진행률·"다시 교정") + 통합 테스트.
      `TranscriptSection`이 레일에 배치하고 `useMeeting`이 결과를 상세와 함께 든다 (2026-09-25)
- [ ] `pnpm dev`로 실제 앱에서 확인 — 전역 용어 저장 → 녹음·처리 → 자동 교정 진행률 → 본문 반영·고친 목록 → 재시작 후 유지 → "다시 교정"
**문장 교정 — 2026-09-28 사용자 요청.** 용어 사전 밖의 오인식까지 문장 뜻을 보고 고친다. 측정 결과 외부 공급자만 해낸다
(`docs/phase5-refine-results.md` "문장 교정"). 설계는 `architecture.md` "회의록 교정 > 문장 교정", 저장은 `data-model.md` "자동 교정 결과 저장".

- [x] 검증 스크립트 `scripts/sentenceRefine.ts` — 로컬·Claude CLI × line·pair, 10분·71분 회의록 (2026-09-28)
- [x] 계약 변경: 마이그레이션 5(`utterances.original_text`), `Utterance.originalText`, `RefineStage`에 `'sentence'`, IPC `utterances:revertRefine`, 설정 `refine.autoExternal`(`isAutoRefineExternal`, 기본 꺼짐) (2026-09-28)
- [x] 순수 로직 `src/shared/sentenceRefine.ts` — 조각 나누기·프롬프트·출력 파싱·어절 LCS·발음 가드(영문 읽기 포함) + vitest (2026-09-28)
- [x] main: 공급자별 분기(`runSentenceRefine`), 자동 실행 조건(외부 공급자는 용어 없이도), 교정 반영 시 `original_text` 보관, 되돌리기 트랜잭션 (2026-09-28)
- [x] renderer: 발화 행 "교정됨" 표시·원문 펼치기·되돌리기, 레일 문구(로컬 안내·문장 교정 단계), 설정 LLM 섹션의 자동 교정 스위치(`features/refine/AutoRefineToggle`) + 통합 테스트 (2026-09-28)
- [ ] `pnpm dev`로 실제 앱에서 확인 — 외부 공급자로 녹음·처리 → 문장 교정 반영 → 원문 보기·되돌리기 → 재시작 후 유지
- [ ] 후속 후보: 자동 반영의 오탐을 줄이기 위한 유사도 하한 상향 또는 판정 2회 교차
- [ ] 후속 후보: Whisper 토큰 확률을 후보 가중치로(스키마 변경 필요)
- [x] ~~후속 후보: 용어 사전을 인식 단계에도 쓰기~~ → **2026-10-01 사용자 결정으로 착수** (아래 "인식 단계 용어 프롬프트").
      회의별 용어 층이 없어졌으므로 녹음 정지 화면 입력·잡 payload는 바꾸지 않고 전역 사전을 쓴다

### 인식 단계 용어 프롬프트 (2026-10-01)

설계는 `architecture.md` "인식 단계 용어 프롬프트", 근거는 `docs/stt-tuning-results.md` "용어 프롬프트".

- [x] 측정 — 102분 회의 CER 19.12% → 18.47% (`-mc 219` + carry). `-mc 0`이면 프롬프트가 꺼지는 것 확인
- [ ] `src/main/pipeline/whisperPrompt.ts` — ggml 어휘 읽기, whisper.cpp 토크나이저 이식, 예산 안의 용어 프롬프트 조립 + vitest (실제 사전 56개 = 218토큰과 일치)
- [ ] `buildWhisperArgs`에 프롬프트 인자, `runStt`가 전역 사전을 읽어 넘김. 어휘 읽기 실패 시 프롬프트 없이 진행 + 경고 로그
- [ ] 설정 용어 목록 안내 문구에 "위쪽 용어부터 인식에 쓰인다" (ko·en)
- [ ] `pnpm dev`로 실제 회의 처리 확인

### 교정 횟수로 용어 자동 등록 (2026-10-19)

사용자 요청. 설계는 `architecture.md` "교정 횟수로 용어 자동 등록", 설정 키는 `data-model.md` `glossary.corrections`.

- [x] `src/shared/correction.ts` — 어절 diff로 바뀐 단어 추출(조사·문장 부호 제거), 횟수 누적과 3회 승격 + vitest (2026-10-19)
- [x] `src/main/glossary/corrections.ts` — `glossary.corrections` 읽고 쓰기, 승격 단어를 `glossary.terms` 끝에 병합, `handleUpdateUtteranceText`에서 호출 (2026-10-19)
- [x] 설정 용어 목록 안내 문구에 자동 등록 한 줄 (ko·en) (2026-10-19)
- [ ] `pnpm dev`로 확인 — 같은 어절을 세 번 고친 뒤 설정 용어 목록에 나타나는지, 다음 회의 처리 로그의 용어 프롬프트에 들어가는지

## UI 리디자인 (2026-09-24, Phase 번호 밖)

사용자 요청으로 Design 캔버스에서 시안("여백")을 확정하고 문서를 먼저 고쳤다 (`architecture.md` "화면 디자인", `data-model.md` "회의록 검색").
사용자 결정: 한글 글꼴 **Pretendard**, **다크 모드 보류**, **회의록 검색 포함**.
커밋은 단계마다 나눈다. 설정 화면은 다른 작업(용어 사전)이 끝나 커밋된 뒤에 손댄다.

- [x] 토큰: `base.css` 값 교체·추가, 다크 블록 제거, `color-scheme: light` (2026-09-24)
- [x] 글꼴: Google Sans·Pretendard·Google Sans Code 원본 파일과 `OFL.txt` 동봉, `fonts.css` (2026-09-24)
- [x] 메인 창: 1280×800 / 최소 1040×640, `titleBarStyle: 'hiddenInset'`, drag 영역 (2026-09-24)
- [x] primitives: `Button` 변형(강조·주요·보조·위험), `Badge`, `Switch`, `Stepper` + 통합 테스트 (2026-09-24, 계약은 `architecture.md` "공통 컴포넌트". 설정의 `Switch`·녹음/위젯의 `Stepper` 적용은 각 화면 항목에서)
- [x] 계약: `meetings:search`·`meetings:changed` 채널, `SearchMeetingsRequest`/`SearchMeetingsResponse`, LIKE 이스케이프 순수 함수 + vitest (2026-09-24)
- [x] main: 검색 쿼리, 목록 변경 지점(녹음 시작·정지·제목 변경·삭제·파이프라인 처리 시작/done/error)에서 `meetings:changed` push (2026-09-24)
- [x] 레이아웃: `AppShellLayout` + `meeting/MeetingSidebarSection`(새 녹음·검색·날짜 묶음 목록·설정 링크), `MeetingListSection` 제거, 홈 빈 상태 (2026-09-24)
- [x] 상세: 두 칸(회의록 + 레일), `TranscriptSection`의 `aside` 슬롯, 화자 목록 레일로 이동 (2026-09-24)
- [x] 상세: 레일 폭 드래그 조절(핸들·키보드·더블클릭 초기화, `localStorage` 저장) (2026-09-24)
- [x] 녹음·위젯: 타이머·파형 레벨 미터(`LevelWaveform`, 녹음 화면만 — 위젯 파형은 2026-09-24 제거)·스테퍼·정지 버튼, 위젯 창 300×304 (2026-09-24)
- [x] 설정·온보딩: 행 레이아웃, `Switch`, 온보딩 두 칸 (2026-09-24)
- [x] 녹음 화면 재배치: 헤더 + 두 칸(보기 카드·제어 / 옵션 패널 "파일로 만들기"·"녹음 설정" 순), 페이지 스크롤 없음, 상태 전환 시 레이아웃 시프트 없음(숨김 대신 비활성, 문구 자리 높이 고정) (2026-09-26, `architecture.md` "화면별 구성" > 녹음)
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과 (2026-09-24)
- [ ] `pnpm dev` 실제 확인 — 창 끌기, 검색(한글 2글자·영문 대소문자·`%` 포함 질의), 제목 변경·삭제 후 사이드바 갱신, 녹음 중 사이드바 표시
- [x] 디자인 패키지: 토큰·글꼴을 `packages/design`으로 올리고 두 앱이 import, 브라우저 프로토타입에 공통 컴포넌트(계약 동일) 이식 (2026-09-24)
- [ ] 후속: 검색 결과에서 해당 발화로 스크롤
- [x] 후속: 다크 모드 — `base.css` 다크 블록(시스템 설정 연동), 스위치 손잡이·비활성 글자·성공 바탕 토큰 추가, 하드코딩 색 제거 (2026-09-28, `architecture.md` "다크 모드")
- [x] 테마 설정: `AppSettings.theme`(`system`·`light`·`dark`, 기본 `system`), `ui.theme` 읽기·검증, main `nativeTheme.themeSource` 적용(시작 시·변경 시), 설정 "화면" 카테고리 (2026-09-28)
- [ ] 다크 모드 `pnpm dev` 실제 확인 — 메인 창·위젯 패널(vibrancy)·설정·온보딩을 시스템 다크/라이트 전환하며 확인

## LLM 공급자 선택 (2026-09-24, Phase 번호 밖)

사용자 요청: LLM을 쓰는 곳(요약·용어 초안)에서 사용자가 구독 중인 Claude를 **API 키(토큰)** 또는 **Claude Code CLI 서브프로세스**로 쓸 수 있게 한다.
같은 날 두 번째 요청으로 **OpenAI API 키(GPT-6 계열, 모델 선택)** 를 추가했다.
설계는 `architecture.md` "LLM 공급자", 설정 키는 `data-model.md`, 함정은 `pitfalls.md` "LLM 공급자" 절. 문서를 먼저 확정했다.

- [x] 계약: `LlmProvider`·`LlmStatus` 타입, settings 키 `llm.provider`·`llm.claudeApiKey`, IPC `llm:status`·`llm:setProvider`·`llm:setClaudeApiKey`·`llm:check`
- [x] OpenAI 추가 (2026-09-24): `openai-api` 공급자, 회사별 키(`LlmApiVendor`, `llm.openaiApiKey`), GPT 모델 선택(`llm.openaiModel`),
      IPC `llm:setClaudeApiKey` → `llm:setApiKey`(회사 지정)로 일반화 + `llm:setOpenaiModel`, `src/main/llm/openaiApi.ts`(`openai` SDK Responses API),
      `LlmSection`에 라디오·키 입력·모델 선택, 테스트 갱신
- [x] 순수 로직 `src/shared/llm.ts` — 공급자 유니온·라벨·준비 판정·CLI 인자·CLI JSON 파싱·Claude 청크 예산 + vitest
- [x] main `src/main/llm/*` — 공급자 추상화, llama 이관, Anthropic SDK(`@anthropic-ai/sdk`), `claude -p` spawn(stdin·PATH 탐색), safeStorage 키 저장, 연결 확인
- [x] `summary/run.ts`·`glossary/draft.ts`가 `createLlmClient()`만 부르도록 정리. 청크 예산은 공급자 값
- [x] renderer: `api/llm` 래퍼, `hooks/domain/llm/useLlmStatus`, `setting/LlmSection`(라디오·키 입력·CLI 상태·연결 확인) + 통합 테스트, 설정 페이지 배치
- [x] `meeting/SummarySection`이 공급자별 준비 여부·문구·캡션을 보이도록 수정 + 테스트 갱신
- [x] 설정 구조 정리 (2026-09-24 사용자 요청) — 카테고리 이름 "언어 모델" → "요약 · 용어 초안", 요약 모델 다운로드 행을 "모델" 카테고리에서
      이 카테고리의 로컬 옵션 아래로 옮기고(`localModelSlot`) 제목을 "로컬 요약 모델 파일"로. "모델" 카테고리는 "음성 인식 모델"만 남는다
- [ ] `pnpm dev` 실제 확인 — 공급자 전환 후 요약, API 키 저장(Anthropic·OpenAI 각각) → 재시작 후 유지, CLI 미설치·미로그인 안내, 연결 확인 성공/실패 문구, GPT 모델 바꾼 뒤 요약
- [x] 교정 O/X 판정(Phase 5-4)도 같은 추상화로 붙이기 (2026-09-25, `src/main/refine/run.ts`)
- [ ] 후속: `GlossarySection` 안내 문구를 공급자 라벨로, CLI 모델·Claude API 모델 선택 옵션
- [x] Codex CLI(구독) 공급자 (2026-09-29 사용자 요청) — `codex-cli` 공급자, `codex exec` spawn(`codexCli.ts`, CLI 공용부 `cliEnv.ts`로 분리),
      모델 카탈로그(`codex debug models`)에서 고르는 모델 선택(`llm.codexModel`, IPC `llm:setCodexModel`, null = CLI 기본), `LlmSection`에 라디오·CLI 상태·모델 선택, 테스트
- [ ] Codex CLI `pnpm dev` 실제 확인 — Finder 실행에서 codex 탐색, 모델 목록 표시, 모델 바꾼 뒤 연결 확인·요약, 등급 밖 모델 선택 시 오류 문구

## 녹음본 재생·내보내기·다시 인식 (2026-09-25, Phase 번호 밖)

사용자 요청으로 "녹음본 재생은 요구사항 아님" 결정을 뒤집었다. 설계는 `architecture.md` "녹음본 재생·내보내기·다시 인식", 저장 규칙은 `data-model.md` "다시 인식". 문서를 먼저 고쳤다.

- [x] 계약: `Meeting.hasAudio`, IPC `meetings:reprocess`·`meetings:exportAudio`와 요청/응답 타입
- [x] main: `meeting-audio://` 프로토콜(Range → 206), 내보내기(저장 대화상자 + 복사), 다시 인식 요청(검증·상태·큐), 성공 저장 트랜잭션(화자 초기화·교정 결과 비움)
- [x] renderer: CSP `media-src`, `api/meetings` 래퍼, `useMeeting`의 `reprocessMeeting`, 레일 "녹음" 패널(플레이어·저장·다시 인식 확인), 발화 시각 클릭 시 이동, 실패 회의 "다시 시도"
- [x] 테스트: 파일명 정리·Range 해석 순수 함수 vitest, 녹음 패널·다시 시도 통합 테스트
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과 (2026-09-25)
- [ ] `pnpm dev` 실제 확인 — 보관 켠 뒤 녹음 → 재생·시킹·발화 시각 클릭, WAV 저장·취소, 참석자 수 바꿔 다시 인식, 실패 회의 다시 시도
- [ ] 후속: 재생 중인 발화 강조

## 녹음 파일 관리 (2026-10-21, Phase 번호 밖)

사용자 요청으로 설정에서 보관 중인 녹음 파일만 모아 보고, 하나씩 또는 골라서 지운다. 녹음 파일만 지우고 회의록은 남긴다.
설계는 `architecture.md` "녹음 파일 관리", 저장 규칙은 `data-model.md` "녹음 파일 관리", 결정 표는 `SKILL.md` 1절 녹음본 행. 문서를 먼저 고쳤다. 스키마 변경은 없다.

- [x] 계약: `MeetingAudioFile`(`src/shared/types.ts`), IPC `meetings:listAudio`·`meetings:deleteAudio`와 요청/응답 타입
- [x] main: 목록 조회(`stat`으로 크기, 없는 파일은 `null`), 삭제(회의마다 `discardRecording`, 녹음 중·처리 중 거절, 실패 수 집계·로그)
- [x] preload + renderer api 래퍼
- [x] 설정 "녹음·처리"에 "녹음 파일 관리하기" 행("관리" → `/recordings`), 경로 상수·라우트·`pages/Recordings`(상단 바 "설정으로")
- [x] `recording/RecordingFileSection`: 합계 줄, 전체 선택·선택 삭제, 행(제목은 글자만 — 상세 페이지가 없어졌다, 날짜·길이·크기·상태, 삭제), 2단계 인라인 확인, 실패 문구, 빈 상태
- [x] 사전(`ko`·`en`) 문구
- [x] 테스트: `RecordingFileSection` 통합 테스트(전체 선택·선택 삭제 확인/취소, 한 행 삭제, 처리 중 행 비활성, 실패 문구, 빈 상태)
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과
- [ ] `pnpm dev` 실제 확인 — 보관 켜고 녹음 두세 개 → 목록·용량, 하나 삭제, 여러 개 골라 삭제, 지운 회의 상세에서 회의록은 남고 재생 바가 "원본 없음"으로 바뀌는지

## 녹음 노트 (2026-10-21, Phase 번호 밖)

사용자 요청으로 녹음하며 장문 노트를 적고(녹음 화면·위젯·회의 상세), 노트를 교정 힌트·요약 재료·뇌 정리 재료로 쓴다. 노트의 링크는 상세에서 눌러 열고, 정리 에이전트가 열어 읽는다.
설계는 `features/recording.md` "녹음 노트", 저장은 `data-model.md` "녹음 노트 저장"(마이그레이션 8), 프롬프트는 `features/transcript.md` "문장 교정"·`features/llm.md` "로컬 LLM 요약", 뇌 정리 연결은 `features/assistant.md` "원문 파일"·"정리 에이전트". 문서를 먼저 고쳤다.
"메모"는 녹음 종류 이름이라 이 기능은 "노트"(`note`)로 부른다.

- [x] 계약: `src/shared/note.ts`(`NOTE_MAX_CHARS`·`extractNoteLinks`·`clipNote`, vitest), `RecordingStateEvent.note`·`MeetingDetail.note`, IPC `recording:setNote`·`meetings:updateNote`와 요청/응답 타입 (2026-10-22, `6b94710`)
- [x] DB: 마이그레이션 8(`meetings.note`), 노트 읽기·쓰기, 상세 조회에 노트 (2026-10-22, `6b94710`)
- [x] main: 세션 노트(녹음 전 초안 → 시작 시 새 회의에 쓰기 → 녹음 중 바뀔 때마다 쓰기 → 정지 시 비우기), 핸들러 검증(문자열·상한·녹음 중 회의 거절) (2026-10-22, `6b94710`)
- [ ] 문장 교정 프롬프트의 참고 노트(`REFINE_NOTE_MAX_CHARS`), 요약 whole·reduce 프롬프트의 노트와 예산(청크 예산 4분의 1, 회의록 예산에서 뺌) — 순수 함수 테스트
- [x] preload + renderer api 래퍼(`6b94710`), `useRecordingNote`(포커스 중 내 초안 우선, 2026-10-22)
- [ ] 화면 — 채팅창 리뉴얼로 옛 녹음 화면·회의 상세는 없어졌다
  - [x] 채팅 녹음 카드의 펼치는 노트 칸("노트" 버튼 → textarea, `features/recording.md` "채팅 창의 녹음" > "녹음 카드") (2026-10-22)
  - [ ] 위젯 노트 보기(헤더 아이콘·돌아가기)
  - [ ] 전체 기록 패널의 노트(옛 상세 레일 노트 카드 대신, blur·⌘Enter 저장, Esc 되돌리기, 링크 목록) — 자리는 시안을 고칠 때 정한다
- [ ] 사전(`ko`·`en`) 문구 — 녹음 카드 몫(`recording.note`)은 넣었다 (2026-10-22)
- [ ] 테스트: ~~`RecorderSection`(노트 입력이 `recording:setNote`로)~~ 완료(2026-10-22, 늦게 온 push 무시·저장 실패 안내 포함), `WidgetPanelSection`(노트 보기 전환·입력), `TranscriptSection`(노트 저장·링크 목록) 통합 테스트
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과
- [ ] 완료 기준(`pnpm dev`): 녹음 전 노트에 적고 녹음 시작 → 위젯 노트 보기에서 이어 적으면 메인 창에도 보인다 → 정지 후 상세 노트 카드에 그대로 있고 링크를 누르면 브라우저가 열린다. 외부 공급자 교정·요약 프롬프트에 노트가 들어간다(로그 또는 임시 파일로 확인). 위젯 패널에서 textarea에 키 입력이 들어간다(`type: 'panel'`)
- [ ] 후속: 앱 안 마크다운 렌더링(채팅창 리뉴얼의 렌더러와 함께), 노트를 회의록 검색·복사에 포함, 로컬 용어 교정 후보에 노트 단어 쓰기

## 마이크 입력 장치·테스트 (2026-09-25, Phase 번호 밖)

사용자 요청으로 설정 화면에 입력 장치 선택과 마이크 테스트를 둔다. 설계는 `architecture.md` "마이크 입력 장치와 테스트", 저장 규칙은 `data-model.md`의 `audio.inputDevice`. 문서를 먼저 고쳤다.

- [x] 계약: `AudioInputDevice`·`AppSettings.inputDevice`(기본 `null`), `audio.inputDevice` 읽기·검증 (`db/settings.ts`, `ipc/handlers.ts`), `updateSettingsApi` 필드 추가
- [x] main: `setPermissionCheckHandler`에서 `media` 허용 (장치 라벨 노출)
- [x] renderer: `utils/microphone` 유틸(+vitest) — 녹음·테스트가 같은 제약을 쓴다, `useRecorder`가 시작 시 설정의 장치를 `ideal`로 요청
- [x] renderer: `useInputDevices`(목록·라벨·`devicechange`)·`useMicrophoneTest`(AnalyserNode RMS·무음 안내) 훅, 설정 카테고리 "마이크"(입력 장치 select, 테스트 버튼 + 파형)
- [x] 테스트: `SettingsSection` 통합 테스트(장치 선택 저장, 연결되지 않은 장치 표기, 테스트 시작·정지·녹음 중 차단), 위젯 테스트에 설정 mock 추가
- [x] `pnpm test`(531개) / `pnpm typecheck` / `pnpm lint`(이 작업 파일 기준) / `pnpm build` 통과 (2026-09-25)
- [ ] `pnpm dev` 실제 확인 — 외장 마이크를 고르고 녹음해 그 장치로 녹음되는지, 장치를 뺀 뒤 녹음이 기본 마이크로 폴백하는지, 테스트 파형이 움직이는지, 음소거 시 무음 안내

## UI 언어 설정 (2026-09-25, Phase 번호 밖)

사용자 요청으로 설정에 UI 언어(한국어 기본 / 영어)를 둔다. 설계는 `architecture.md` "UI 언어", 저장 규칙은 `data-model.md`의 `ui.locale`. 문서를 먼저 고쳤다.
인식·요약 언어는 바뀌지 않는다 — 화면·메뉴바·오류 문구만 바꾼다.
이름 없는 화자의 기본 표시("화자 N"·"화자 미상")는 `@meeting-stt/core/format`의 `resolveSpeakerNames`가 `defaultNames`를 선택 인자로 받아 앱이 UI 언어의 이름을 넘긴다 (넘기지 않으면 한국어 — `apps/web`은 그대로).
남긴 한국어: 운영 로그, LLM 프롬프트, 내보내기 파일명 폴백(`회의 녹음`), `NSMicrophoneUsageDescription`, `apps/web`.

- [x] 계약: `Locale`·`AppSettings.locale`(기본 `'ko'`), `ui.locale` 읽기·검증 (`db/settings.ts`, `ipc/handlers.ts`), `updateSettingsApi` 필드 추가, push 채널 `settings:changed`
- [x] 사전: `src/shared/i18n.ts` + `src/shared/locales/<domain>.ts` (`ko`·`en` 나란히, `en`은 `typeof ko`)
- [x] renderer: `shared/provider/context/localeContext`(`LocaleProvider`·`useLocale`), 컴포넌트·훅·api 래퍼·포맷터의 문구를 사전으로 이동, `<html lang>` 동기화
- [x] main: `src/main/locale.ts`의 `t()`, 메뉴바 메뉴·저장 대화상자·핸들러 오류 문구 이동, 언어 변경 시 `refreshTray` + `settings:changed` push
- [x] 설정 화면 "언어" 카테고리 (select, 즉시 반영) — `SettingsSection/ui/LocaleSelect`
- [x] 테스트: 기존 통합 테스트는 기본값(한국어)으로 그대로 통과, `localeContext`에 영어 전환 테스트, `src/shared/i18n.test.ts`가 ko·en 키 집합 일치와 영어에 한글 미포함(용어 사전 예시 제외)을 검사
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과 (2026-09-25)
- [ ] `pnpm dev` 실제 확인 — 영어로 바꾸면 메인 창·위젯 창·메뉴바가 즉시 바뀌는지, 재시작 후 유지되는지

## 화자 재군집 (2026-09-25, Phase 번호 밖)

사용자 결정으로 화자 분리 개선안(`docs/diarization-clustering-results.md` 8절의 **안 A**)을 적용한다. 설계는 `architecture.md` "화자 재군집", 결정 표는 `SKILL.md` 1절 화자 분리 행. 문서를 먼저 고쳤다.
CLI 라벨을 버리고 결과 구간을 5초 조각으로 재임베딩(`sherpa-onnx-node`) → k-means(K = 참석자 수, 모르면 12) + 중심 병합 0.75로 다시 군집한다. 바이너리·모델·온보딩은 그대로다.

- [x] `packages/core/src/cluster.ts`: 조각 분할·L2 정규화·k-means(k-means++, 고정 시드, 10회 재시작)·중심 병합·라벨 재배정 + vitest 17개
- [x] `sherpa-onnx-node` 1.13.8 의존성 추가(`apps/desktop` dependencies), 타입 선언 `src/main/types/sherpaOnnxNode.d.ts`, `electron-builder.yml` `asarUnpack`
- [x] main: `pipeline/speakerEmbedding.ts`(동기 임베딩, 스크립트 공용) · `pipeline/embedWorker.ts`(utilityProcess 진입) · `pipeline/embed.ts`(fork·메시지) · `pipeline/recluster.ts`(흐름·폴백) · `run.ts` 연결(`diarize` 0~90% / 90~100%)
      — 실제 Electron `utilityProcess`에서 빌드된 워커로 임베딩이 나오는 것을 확인했다. Electron은 N-API 외부 버퍼를 금지하므로 `enableExternalBuffer=false`가 필수다 (`pitfalls.md`)
- [x] `diarize.ts`: 참석자 수가 없으면 `num-clusters=12` (임계값은 명시했을 때만), 테스트 갱신
- [x] 스크립트: `scripts/recluster.ts`(CLI 구간 + WAV → 재군집 구간 파일, 임베딩 캐시) · `scripts/pipeline.ts`에 재군집 반영(`--no-recluster`로 CLI 군집 비교)
- [x] 검증(`diarBench.ts`, 3스레드 + nice, `docs/diarization-clustering-results.md` 11절): jun-meeting K=7 **92.7%**(기준선 83.4%), K 없음(`num-clusters=12` 구간 + K=12) **92.9%**(기준선 63.8%), Python 실험과 ±0.5%p.
      K=6에서 병합 0.7은 실제 화자를 합쳐 87.0% → **0.75 확정**. geumtoro는 K=3·4로는 안정, 참석자 수 없이는 10명 (정답본 없음)
- [x] `pnpm test`(565개) / `pnpm typecheck` / `pnpm lint` / `electron-vite build` 통과 (2026-09-25)
- [x] 패키징(`build:unpack`)에서 `sherpa-onnx-darwin-arm64`(애드온·dylib)가 `app.asar.unpacked/node_modules/`로 풀리고 워커 `out/main/embedWorker-*.js`가 asar에 들어가는 것을 확인 (2026-09-25)
- [ ] `pnpm dev` 실제 확인 — 참석자 수를 넣고/빼고 녹음해 회의록 화자 수, 진행률이 90%에서 잠깐 머물다 끝나는지, 로그에 재군집 결과(조각 수·클러스터 수·시간)
- [ ] 후속: 발표형 원거리 녹음의 참석자 수 없음 경로(발표자가 여러 클러스터로 남음) 개선, 병합 임계값 0.75를 2~3명 짧은 회의로 재확인, 웹 프로토타입도 `@meeting-stt/core/cluster`로 통일
      → 앞의 두 항목은 **화자 분리 2차 실험**(2026-10-01 사용자 요청, `docs/diarization-experiments.md`)의 실험 0·E1에 포함했다. 측정 기반(데이터셋 확대·편집 비용·DER·잡음 바닥)을 먼저 갖추고, 실험별 채택 기준을 미리 적은 뒤 수치로만 결정한다. 제품 코드는 채택 전까지 바꾸지 않는다
      → **2026-10-01 결과: 채택 없음** (E1 화자 수 추정·E3 긴 조각 중심은 보류, 나머지 기각·판단 불가). 제품 코드·결정 표는 그대로다. 참석자 수 없음 경로가 k-means 시드에 따라 흔들리는 문제(4명 회의 최대 7%p)와 0.75 병합이 영어 4명 회의에서 실제 화자를 합친 사례가 새로 나왔고, 실제 한국어 녹음·정답본이 더 생기면 다시 잰다 (같은 문서 9~11절)

## 녹음 파일 가져오기 (2026-09-25, Phase 번호 밖)

사용자 요청으로 앱 밖에서 녹음한 파일로도 회의록을 만든다. 설계는 `architecture.md` "녹음 파일 가져오기", 결정 표는 `SKILL.md` 1절 녹음 행. 문서를 먼저 고쳤다.
스키마 변경은 없다.

- [x] main: `src/main/audio/importRecording.ts` — 열기 대화상자 → `afconvert` 변환 → 길이 확인 → 회의 행 + 파이프라인 잡
- [x] IPC `meetings:import` + preload + renderer `importMeetingAudioApi`
- [x] 녹음 화면 "녹음 파일 가져오기" 버튼(`features/meeting/ImportAudioButton`)(대기 중일 때만), 성공 시 상세로 이동, 실패 문구
- [x] 사전(`ko`·`en`) 문구, 테스트 — `importSource.test.ts`(헤더·제목), `RecorderSection/test.tsx`(이동·취소·실패·녹음 중 숨김)
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과, 스테레오 AAC m4a를 `afconvert`로 바꾼 WAV가 `scripts/pipeline.ts`(정규화·whisper·재군집)를 통과 (2026-09-25)
- [ ] `pnpm dev` 실제 확인 — m4a·mp3·mp4를 가져와 회의록이 만들어지는지

## 라이브 받아쓰기 (2026-09-26, Phase 번호 밖)

사용자 요청으로 녹음 화면의 파형 영역을 라이브 받아쓰기 보기로 바꿀 수 있게 한다. 설계는 `architecture.md` "라이브 받아쓰기", 결정 표는 `SKILL.md` 1절.
"실시간 스트리밍 STT 금지"(4절 범위 절제)의 사용자 결정 예외이고, 문서를 먼저 고쳤다. 스키마 변경·새 모델은 없다.

- [x] main: `src/main/audio/liveWindow.ts`(구간 나누기, 순수) + `liveTranscript.ts`(whisper-cli 실행), 세션 청크·시작·정지에 연결
- [x] IPC `recording:setLiveTranscript` + `RecordingStateEvent.liveTranscript` + preload + renderer `setLiveTranscriptApi`
- [x] `RecorderSection` 보기 전환(파형 / 라이브 받아쓰기)과 라이브 보기, 사전(`ko`·`en`) 문구
- [x] 테스트 — `liveWindow.test.ts`, `RecorderSection/test.tsx`(전환·표시)
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과, 실제 회의 녹음(jun-meeting)을 0.5초 청크로 실시간 속도로 흘려 `liveWindow` + whisper-cli(turbo)를 돌린 결과 갱신 간격 1.1~1.6초, 12초마다 확정 (2026-09-26)
- [x] 라이브 모델을 turbo로 고정 (2026-09-26 사용자 결정) — `LIVE_WHISPER_MODEL_ID`, `liveWhisperModelPath()`, 저사양 선택·turbo 파일 없음 폴백
- [ ] `pnpm dev` 실제 확인 — 녹음 중 말하면 1~2초 안에 글자가 나타나는지

## 레벨 미터를 이퀄라이저형으로 (2026-09-26, Phase 번호 밖)

이력형 파형(0.5초마다 왼쪽부터 칸을 채움)이 24초 동안 차오르는 모양이라 진행 바로 읽힌다는 사용자 지적. 현재 음량에 모든 막대가 함께 반응하는 이퀄라이저형으로 바꾼다. 계약은 `architecture.md` "공통 컴포넌트"의 `LevelWaveform`.

- [x] `LevelWaveform` props `levels[]` → `level`, 종 모양 포락선 + 막대별 CSS `transform` 흔들림, `prefers-reduced-motion` 대응 (데스크탑·웹 두 구현)
- [x] `useRecordingState`·`useMicrophoneTest`에서 레벨 이력(`levels`, 48개) 제거 — 더 쓰는 곳이 없다
- [ ] `pnpm dev` 실제 확인 — 말하면 막대가 함께 튀고 조용하면 점으로 가라앉는지, 팬·CPU 변화 없는지

## 피드백 보내기 (2026-09-28, Phase 번호 밖)

사용자 요청. 서버·정보 수집 없이 GitHub 이슈 작성 화면을 미리 채워 브라우저로 연다. 설계는 `architecture.md` "피드백 보내기".

- [x] `.github/ISSUE_TEMPLATE/feedback.yml` 이슈 폼 (`kind`·`description`·`app-version`·`os`)
- [x] main: `feedbackUrl.ts`(순수) + `windows/externalUrl.ts`(https만 허용) + 메인 창 `setWindowOpenHandler`를 같은 규칙으로
- [x] IPC `feedback:open` + preload + renderer `openFeedbackApi`
- [x] 설정 "피드백" 카테고리와 `FeedbackButton`, 사전(`ko`·`en`) 문구
- [x] 테스트 — `feedbackUrl.test.ts`, `externalUrl.test.ts`, `FeedbackButton/test.tsx`. `pnpm test` / `pnpm typecheck` / `pnpm lint` 통과 (2026-09-28)
- [x] `pnpm dev` 실제 확인 — 버튼을 누르면 브라우저에 이슈 작성 화면이 열린다 (2026-09-28 사용자 확인). 버전·OS 필드 채움은 `feedback.yml`이 원격 main에 푸시된 뒤 확인

## 요약 템플릿 (2026-09-29, Phase 번호 밖)

사용자 요청. 미리 준비된 블록을 위에서부터 쌓아 요약 형식(템플릿)을 만들고, 요약할 때마다 고른다. 설계는 `architecture.md` "요약 템플릿", 저장은 `data-model.md` "요약 템플릿 저장".
1차 범위: 평평한 쌓기(중첩 없음), 블록 제목 바꾸기만, 공유 없음. 기본 템플릿은 지금 형식 그대로 내장.

- [x] 순수 로직 `src/shared/summaryTemplate.ts` — 블록 카탈로그, `compileTemplate`, 저장 검증, `buildTemplatePreview` + 테스트.
      **기본 템플릿 컴파일 결과 = 기존 `FINAL_FORMAT`·`CHUNK_FORMAT`** 을 테스트로 고정
- [x] `src/shared/summary.ts` 프롬프트 조립 함수가 형식 문자열을 인자로 받게 바꾸기 (기존 테스트 유지)
- [x] 마이그레이션 6 `summary_templates` + `src/main/db/summaryTemplates.ts` (목록·저장·삭제, `blocks` JSON 좁히기)
- [x] IPC `summaryTemplates:list/save/delete`, `CreateSummaryRequest.templateId`, preload·renderer api(`shared/api/summaryTemplate`)
- [x] `main/summary/run.ts` — 잡 시작 시 템플릿을 읽어 컴파일(없으면 기본 + 경고 로그), 결과에 제목이 빠지면 경고 로그
- [x] `useSummaryTemplates` 훅, 설정 `setting/SummaryTemplateSection`(블록 모음·쌓인 블록·미리보기·↑↓/드래그·키보드) + 통합 테스트
- [x] 요약 카드 템플릿 선택 + 통합 테스트
- [x] 편집기를 전용 페이지 `/summary-templates`로 옮기고 설정에는 "템플릿 관리" 이동 행만 남기기 (2026-09-29 사용자 요청, 통합 테스트 포함. `pnpm dev` 화면 확인은 남음)
- [x] 사전 `src/shared/locales/summaryTemplate.ts` (`ko`·`en`)
- [x] 편집기를 좌(블록 모음)·우(놓는 곳) 두 칸으로 바꾸고 블록 모음 → 놓는 곳 드래그앤드롭 추가 (2026-09-29 사용자 요청, 통합 테스트 포함)
- [ ] 측정 — `scripts/summarize.ts --template <블록.json>`(구현 완료, 빠진 제목 수를 출력)로 71분 회의를 블록 3·6·10개 템플릿으로 로컬 요약해 제목 누락률을 재고, 안내 임계값(잠정 6)을 확정
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 통과 (2026-09-29), `pnpm dev` 실제 확인 (템플릿 만들기 → 요약 카드에서 골라 요약 → 결과 모양 일치).
      설정 화면에서 복제·블록 추가·↑↓·저장·재시작 후 유지는 Electron 스크린샷으로 확인(2026-09-29). 요약 카드에서 골라 실제 요약하는 흐름은 남음

후속 후보 (1차 범위 밖):

- [ ] 반복 블록("주제마다"·"참석자마다", 깊이 1) — 측정 결과를 보고 외부 공급자 전용 여부와 함께 결정
- [ ] 블록 손잡이(개수·모양·빈 경우 처리)
- [ ] 블록 카탈로그 확장

## 품질 점검 후속 (2026-09-26, Phase 번호 밖)

2026-09-26 전체 코드 점검(main 견고성·renderer UX·테스트/배포/문서)에서 나온 개선 항목을 사용자 지시로 로드맵에 올린다.
새 기능이 아니라 이미 있는 것을 고치는 작업이라 Phase 번호는 붙이지 않는다. 진행 순서는 아래 절 순서(1 → 2 → 3)를 기본으로 하되,
각 항목이 계약(IPC·스키마·상수)을 바꾸면 SSOT 규칙대로 `architecture.md`·`data-model.md`를 먼저 고친다.
다른 세션이 진행 중인 "일시정지·재개"(`architecture.md` 같은 이름의 절) 작업과 겹치는 파일(`session.ts`, `RecorderSection`, `WidgetPanelSection`)은 그 작업이 커밋된 뒤 손댄다.

### 1. 데이터가 날아갈 수 있는 것 (먼저)

- [ ] **디스크 부족(ENOSPC)에서 녹음 세션이 영구히 막히는 문제.** `audio/wavWriter.ts`의 쓰기 체인(`queue = queue.then(...)`)이 한 번 reject되면 이후 append·finalize가 전부 실패하고, `stopRecording`이 finalize 뒤에 `session = null`을 해서 세션이 남아 다음 녹음이 `alreadyActive`가 된다.
      → 실패한 append는 체인을 끊지 않고 오류를 세션에 보고, `stopRecording`은 finalize가 실패해도 세션을 반드시 비운다. 녹음 시작 전 `statfs`로 여유 공간(예: 1시간분 115MB)을 확인해 부족하면 사전(`ko`·`en`) 문구로 막는다
- [ ] **크래시 중이던 녹음 복구.** WAV 헤더를 정지 시에만 확정해 크래시 후 `dataBytes = 0`으로 남고, `readWavPcm`이 빈 PCM을 읽어 다시 인식해도 결과가 빈다.
      → 앱 시작 시 `status='recording'`으로 남은 회의의 WAV를 파일 크기로 헤더를 고쳐 `duration_sec`을 채우고 `error`(원본 보존)로 바꿔 "다시 시도"가 되게 한다. 헤더 복구 함수는 순수 로직으로 두고 단위 테스트
- [ ] **처리 중·녹음 중 회의 삭제 방지.** `ipc/handlers.ts`의 삭제 핸들러에 상태 확인이 없어 파이프라인은 끝까지 돌고 마지막 `saveTranscript`만 FK 오류로 실패한다.
      → `recording`·`processing`(대기 포함)이면 삭제를 거절하거나 잡을 먼저 취소한다(아래 취소 항목과 함께). 사이드바 삭제 UI는 그 상태에서 비활성
- [ ] **외부 프로세스 취소·타임아웃.** `bin/spawn.ts`의 `runBinary`와 `pipeline/embed.ts`가 AbortSignal도 타임아웃도 받지 않고, 큐(`pipeline/queue.ts`)에서 잡을 빼는 API가 없다. llama-cli·`claude -p`가 멈추면 동시성 1 큐 전체가 막힌다.
      → `runBinary({ signal, timeoutMs })`, 큐 잡 취소, 앱 종료(`before-quit`) 시 도는 자식 프로세스 전부 kill. 자식 프로세스 목록을 한 곳에서 추적한다
- [ ] **DB 마이그레이션 트랜잭션화 + 사전 백업.** `db/migrations.ts`가 단계별 `exec`와 `user_version` 갱신을 따로 실행해 4번(DROP·RENAME·UPDATE·ADD)이 중간에 실패하면 반쯤 적용된 채 재시도도 실패한다. DB 버전이 앱보다 높을 때(다운그레이드)도 막지 않는다.
      → 단계마다 `db.transaction`, 마이그레이션 전 `VACUUM INTO meetings.backup-<version>.db`, 버전이 높으면 안내 후 종료
- [ ] **연속 UPDATE 트랜잭션.** `audio/session.ts`의 `stopRecording`(duration·speakerCount·status)과 `audio/importRecording.ts`(insert·duration·speakerCount·status)를 트랜잭션 하나로 묶는다
- [ ] 완료 기준: 디스크 가득 찬 상태(이미지 마운트)에서 녹음 → 안내 → 세션 정리 → 다음 녹음 정상. 녹음 중 강제 종료 → 재시작 → 회의가 `error`로 보이고 "다시 시도"로 회의록 생성. `pnpm test`에 헤더 복구·마이그레이션 트랜잭션 테스트

### 2. 사용 중 체감되는 것

- [ ] **정규화 메모리 급증.** `pipeline/normalize.ts`가 WAV 전체를 읽고 slice·applyGain·concat으로 사본을 세 번 만들어 2시간 녹음이면 순간 약 1GB다.
      → 두 패스(1패스: 프레임 RMS만 계산, 2패스: 스트림으로 게인 적용해 쓰기)로 바꿔 상주 메모리를 프레임 버퍼 수준으로 낮춘다. `@meeting-stt/core/normalize` 공식은 그대로
- [ ] **라이브 받아쓰기 실패 시 구간 무한 증가.** `audio/liveTranscript.ts`의 실패 처리가 `pending`을 비우지 않아 turbo 모델이 없는 경우처럼 계속 실패하면 청크가 녹음 내내 자라고 매번 전체를 복사한다(O(n²)).
      → 실패해도 최대 구간(12초)을 넘는 앞쪽 청크는 버리고, 연속 실패 N회면 라이브 보기를 끄고 사전 문구로 안내. 정지·보기 끄기 시 도는 whisper를 kill
- [ ] **대기 중 회의의 상태 표시.** `stopRecording`이 큐에 넣기만 하고 `recording`으로 두어 앞 잡이 끝날 때까지 사이드바에 "녹음 중"으로 보인다. 가져오기 경로처럼 즉시 `processing`으로 바꾼다
- [ ] **로그 파일 저장.** `log.ts`가 `process.stdout`에만 써서 패키징된 앱에서는 로그가 사라진다. `userData/logs/main.log`에 쓰고 크기 기준 순환(예: 5MB × 3). 설정 화면에 "로그 폴더 열기". `windows/shortcuts.ts`가 버리는 등록 실패 원인도 로그에 남긴다
- [ ] **시스템 오디오 도구 고아 프로세스.** 도구가 `error:` 줄만 내고 살아 있으면 `session.systemAudio = null`로 참조만 버린다. `onFailure`에서 `stop()`을 부른다. 마이크 청크가 멈췄을 때 FIFO가 무한히 자라지 않게 상한(예: 30초분)을 둔다
- [ ] **인라인 편집 접근성 3종** (`shared/components/primitives/InlineEditableText`, `useInlineEdit`):
      (a) 표시 버튼의 `aria-label`이 본문을 대체해 모든 발화가 "발화 내용 수정"으로만 읽힌다 → `aria-label` 대신 `aria-describedby`나 시각적으로 숨긴 접두 텍스트로 바꿔 본문이 읽히게,
      (b) Enter·Esc·blur로 에디터가 사라진 뒤 표시 버튼으로 포커스 복원,
      (c) `isComposing` 검사 추가(한글 조합 중 Enter·Esc 무시, `TermRow`와 동일). 여러 줄 편집의 Cmd+Enter 확정을 사전 문구로 안내
- [ ] **확인 단계 포커스.** 삭제(`TranscriptActions`)·다시 인식(`RecordingBar`)·화자 합치기(`SpeakerPanel`)의 2단계 인라인 확인이 뜰 때 확인 버튼으로 포커스를 옮긴다
- [ ] **언어 전환 시 용어 사전 편집 소실.** `GlossarySection/model/useGlossary.ts`의 조회 effect가 `t`에 의존해 언어를 바꾸면 다시 불러오며 편집을 덮는다 → 조회는 마운트 한 번, 오류 문구는 표시 시점에 `t`로 만든다
- [ ] **상세 화면 이중 조회·에러 덮임.** `SummarySection`이 `useMeeting`을 따로 호출해 조회·구독이 두 번이고, 다시 인식 중 요약 패널이 옛 상태로 남는다. `TranscriptSection`은 재조회 실패 시 본문 전체가 에러로 바뀌고 다시 시도가 없다
      → 회의 하나는 `TranscriptSection`이 한 번만 조회해 props/컨텍스트로 내려주고, 이미 불러온 뒤의 실패는 인라인 배너 + `refetch` 버튼
- [ ] **긴 회의 렌더.** 발화 행마다 화자 `select`·버튼이 붙고 memo가 없어 복사·`useNow` 갱신마다 전체가 리렌더된다. 먼저 300발화 이상 회의로 측정하고, 실제로 버벅이면 행 분리·`memo` → 그래도 부족하면 가상화(의존성 추가는 문서 먼저)
- [ ] **모델 설명 문구 사전화.** `packages/models/src/desktop.ts`의 한국어 설명이 사전을 거치지 않아 영어 UI에서도 한국어다 → 카탈로그에는 설명 키만 두고 문구는 `src/shared/locales/models.ts`에 `ko`·`en`. `SummarySection`·`RefinePanel`의 문장 부호 이어 붙이기(`{missingMessage}.`)도 사전 문구로
- [ ] **설정 저장 경쟁·낙관적 반영.** `useSettings`가 닫힌 스냅샷에 변경을 덧붙여 저장해 연타 시 앞 변경이 되돌려질 수 있고, 스위치가 IPC 왕복 뒤에야 바뀐다. 투명도 슬라이더는 input마다 IPC를 보낸다 → 함수형 갱신 + 낙관적 반영, 슬라이더는 디바운스, `settings:changed` 구독
- [ ] **작은 상태 처리.** 설정·용어 사전·LLM 섹션 로드 실패 시 다시 시도 버튼, 모델 확인 중 빈 화면(`routes/guards.tsx`) 대신 로딩 표시, 업데이트 배너 닫기, 에러 문구에 `role="alert"` 통일, 검색 결과 개수 `aria-live`
- [ ] **기능 공백 (각각 문서 먼저).** 재생 중 발화 강조(재생·내보내기 절 후속), 검색 결과에서 해당 발화로 스크롤(UI 리디자인 절 후속), 회의록 파일 내보내기(md·txt·srt, 요약 포함 여부 선택), 발화 삭제·분할, 앱 내 단축키(Space 재생/정지, ⌘F 검색, ⌘N 새 녹음), 온보딩 언어 선택
- [ ] 완료 기준: 2시간 녹음 처리 중 main 상주 메모리 300MB 이하. turbo 모델 파일을 지운 채 라이브 보기를 켜고 5분 녹음해도 메모리가 늘지 않음. VoiceOver로 발화 본문이 읽히고 편집 후 포커스가 제자리. 영어 UI에서 한국어 문구 없음

### 3. 배포·구조·문서

- [ ] **웹 프로토타입 군집을 core로 통일.** `apps/web/src/workers/diarizeWorker.ts`가 자체 `clusterByCompleteLinkage`(83.4%)를 쓴다 → `@meeting-stt/core/cluster`의 k-means + 병합(92.7%)으로 바꾸고 `apps/web/src/pipeline/cluster.ts`·중복 `l2Normalize` 삭제, `docs/browser-prototype-plan.md`의 AHC 서술 갱신 (화자 재군집 절 후속과 같은 항목)
- [ ] **앱 용량(408MB) 줄이기.** `electron-builder.yml` `files`에 `!**/*.{map,d.ts,d.mts}` 제외(`openai`·`@anthropic-ai/sdk`), `react-router`를 devDependencies로(renderer 번들에 인라인됨), `libllama-server-impl.dylib`(8.9MB) 동봉 필요 여부를 `otool -L`로 확인해 불필요하면 `scripts/assets.ts`에서 제외, better-sqlite3 unpacked 26MB에 빌드 산출물이 섞였는지 확인. 목표와 결과 크기를 `distribution.md`에 기록
- [ ] **`release:mac` 스크립트 제거.** `--publish always`가 남아 있어 실수로 배포될 수 있다. `distribution.md` 로컬 릴리스 절차(3단계 "쓰지 않는다")와 맞춘다. 루트 `package.json`의 위임 스크립트도 함께
- [ ] **entitlements 정리.** `build/entitlements.mac.plist`의 `com.apple.security.cs.allow-dyld-environment-variables`는 코드에서 쓰지 않는다(`distribution.md` "DYLD_LIBRARY_PATH 불필요") → 제거 후 서명 빌드에서 동봉 dylib 로드 확인
- [ ] **창 보안.** ~~`windows/main.ts`의 `setWindowOpenHandler`가 스킴 검사 없이 `shell.openExternal`을 부른다~~ → 2026-09-28 피드백 보내기에서 `https:`만 허용하도록 바꿨다 (`windows/externalUrl.ts`). 남은 것: `will-navigate` 차단, 위젯 창에도 같은 핸들러. `sandbox: false`를 `true`로 바꿀 수 있는지(preload가 Node API를 쓰는지) 확인해 결정을 `architecture.md`에 기록
- [ ] **의존성.** `@types/better-sqlite3` 9.x → `better-sqlite3` 13.x에 맞는 버전, Electron 39가 지원 범위(최신 3개 메이저)에 있는지 확인해 필요하면 올린다(네이티브 리빌드·`onlyBuiltDependencies` 확인). `apps/web`의 `tsx`는 `smokeModels.ts`를 부르는 스크립트를 등록하거나 제거
- [ ] **Node 버전 고정.** 루트에 `.nvmrc`(22) 추가. 기본 node가 20이면 desktop vitest 설정이 `ERR_REQUIRE_ESM`으로 로드조차 안 된다. `monorepo.md`에 한 줄 적는다
- [ ] **테스트 공백.** DB 레포지토리(`db/*.ts` 8개, 마이그레이션 1→4 포함)·IPC 핸들러·파이프라인 조립부(`run`·`queue`·`recluster`·`reprocess`)·`session.ts`·`wavWriter.ts`. DB는 vitest에서 better-sqlite3가 Electron ABI로 빌드되어 로드되지 않는 문제부터 푼다(테스트용 node ABI 리빌드 스크립트 또는 SQL 계층 분리). E2E(Playwright) 도입 여부를 `.claude/rules/test-strategy.md`에서 결정(현재 "Phase 4에서 검토"로 미결)
- [ ] **컨벤션.** `ipc/handlers.ts`(657줄)를 도메인별 파일(`ipc/meetings.ts`, `ipc/recording.ts`, `ipc/settings.ts`, `ipc/llm.ts`)로 분리, `registerIpcHandlers`(약 200줄)·`startSystemAudioCapture`(약 90줄) 50줄 이하로. `settings.update` 핸들러의 인라인 로직 함수화
- [ ] **CI.** `build.yml`에 whisper.cpp 소스 빌드 캐시, `concurrency`(이전 실행 취소), `apps/web` 빌드 포함
- [ ] **문서 드리프트.** k-means 결정 근거가 git 제외된 `docs/external/`에만 있어 커밋된 문서만 보면 AHC가 정답처럼 읽힌다 → 근거 요약을 `docs/diarization-clustering-results.md`에 옮긴다. `data-model.md` 설정 키 표에 `llm.provider`·`llm.openaiModel`·`llm.*ApiKey` 추가. `architecture.md` IPC 규약 블록에 `events.settingsChanged` 추가. `.claude/rules/*`의 존재하지 않는 예시(`useAudioLevel`, `RecordButton`, `groupBySpeaker`)를 실제 코드 예로 교체. Windows 잔재(`win`/`nsis` 블록, `build:win`, `icon.ico`, `electron-winstaller`)는 제거하거나 "유지하지 않음"을 파일 주석으로
- [ ] 완료 기준: `pnpm build:mac` 결과 크기가 문서 목표 이하, `release:mac` 없음, `.nvmrc`로 새 셸에서 `pnpm test` 전부 통과, 웹 프로토타입이 core 군집으로 데스크탑과 같은 라벨을 냄

## 녹음 품질 안내 (2026-10-02, Phase 번호 밖)

"녹음 품질 자체가 나빠서 인식이 망가지는 경우를 기획으로 풀 수 있는가"라는 사용자 질문에서 시작했다. 측정 → 녹음 중 안내 → 사후 표시 순서로 진행한다 (2026-10-02 사용자 결정).
설계는 `architecture.md` "녹음 품질 안내", 수치는 `docs/recording-quality-results.md`.

### 측정 (먼저)

- [x] 가진 녹음 17편의 지표(발화 음량·바닥 잡음·폭·클리핑) — 폭이 근거리(24dB 이상)와 원거리(20dB 미만)를 가른다 (`scripts/qualitySurvey.ts survey`)
- [x] 실제 회의 발췌를 감쇠·잡음·클리핑·대역 제한으로 나쁘게 만든 21개 조건의 CER — 음량은 무관, 폭이 CER을 정한다 (`scripts/qualityDegradeBench.ts`)
- [x] 실제 회의 안에서 화자·턴 음량별 CER — 5dB 작게 들어온 턴이 1.5배 (`scripts/qualitySurvey.ts speakers`, `scripts/cerAlign.ts`)
- [x] 앱 캡처 경로(가짜 마이크로 파일 입력)의 지표와 CER, 마이크 제약 변형 3종 — Chromium 잡음 억제가 CER을 3~7%p 올린다
- [ ] 실제 마이크로 녹음한 회의에서 임계값(폭 20dB, 발화 −60 dBFS) 확인 — 사용자 몫. `meetings.audio_quality`에 쌓이는 지표로 본다

### 잡음 억제 끄기 (제안, 사용자 확인 대기)

측정 4절에서 나온 제안이다. **확인 전에는 코드를 바꾸지 않는다** — 녹음 제약은 `architecture.md` "녹음 (renderer)"에 적힌 계약이다.

- [ ] 사용자 확인: `getUserMedia` 제약의 `noiseSuppression`을 `true` → `false`로 (에코 제거·자동 게인은 그대로)
- [ ] 확인되면: `architecture.md` "녹음 (renderer)"·`pitfalls.md`·`plan.md` 인용부 → `shared/utils/microphone`의 제약과 테스트 → 웹 프로토타입(`apps/web/src/audio/recorder.ts`)도 같은 값으로
- [ ] 완료 기준: `pnpm dev`에서 실제 마이크로 녹음한 회의의 `audio_quality` 폭이 직접 녹음 수준(조용한 방에서 30dB 안팎)으로 나오고, 같은 자리에서 잡음 억제를 켠 녹음보다 회의록이 나쁘지 않다

### 녹음 중 안내

- [ ] `src/shared/audioQuality.ts` — 프레임 RMS 분위수(발화 음량·바닥 잡음), `assessAudioQuality`(`silent` −60 dBFS / `faint` 폭 20dB) + vitest
- [ ] `src/main/audio/qualityMonitor.ts` — 청크를 50ms 프레임으로 잘라 20초·180초 창에 쌓고 판정 + vitest (무음 → `silent`, 좁은 폭 → `faint`, 60초 전에는 `faint` 없음, 조건이 풀리면 해제)
- [ ] `RecordingStateEvent.qualityIssue` — `session.ts`가 WAV에 쓰는 샘플을 모니터에 넣고 상태에 싣는다. 일시정지 중에는 넣지 않는다
- [ ] 사전 `recording.quality.*` (`ko`·`en`), `RecorderSection` 안내 두 줄 자리, `WidgetPanelSection` 맨 아래 안내 자리 + 컴포넌트 테스트
- [ ] 완료 기준: `pnpm dev`에서 마이크를 음소거한 채 녹음하면 20초 뒤 두 창에 안내가 뜨고, 음소거를 풀면 사라진다. 레이아웃이 밀리지 않는다

### 사후 표시

- [ ] `pipeline/normalize.ts` — 프레임 RMS에서 바닥 잡음까지 뽑아 `NormalizeResult`에 싣기, `runPipeline`이 `{ utterances, audioQuality }` 반환
- [ ] 마이그레이션 7 `meetings.audio_quality`, `db/meetings.ts` 저장·읽기(`Meeting.audioQualityIssue`), `queue.ts`가 발화 저장 뒤 기록
- [ ] 사전 `transcript.audioQuality.*` (`ko`·`en`), `TranscriptSection/ui/AudioQualityNotice.tsx` + 컴포넌트 테스트
- [ ] 완료 기준: 원거리 녹음 파일(폭 20dB 미만)을 가져오면 회의록 위에 안내가 보이고, 근거리 녹음에는 보이지 않는다

### 보류 (측정에서 근거가 약했던 것)

- 발화 단위 "잘 안 들린 구간" 표시 — 음량이 작은 턴도 글자의 4분의 3은 맞는다. whisper 토큰 확률이 오류 위치를 맞히는지부터 재야 한다 (`scripts/cerAlign.ts`로 잴 수 있다)
- 블루투스 통화 모드 마이크 안내(+4.8%p) — 소리 지표에 드러나지 않고 Chromium이 연결 방식을 주지 않는다. 트랙의 표본화율로 가릴 수 있는지 실제 장치로 확인 필요
- 이어폰을 낀 온라인 회의에서 시스템 오디오가 꺼져 있을 때의 안내 — 출력 장치 종류를 알아야 한다
- 마이크에서 먼 참석자의 말이 더 틀리는 문제(같은 회의 안 1.5배) — 녹음 전체에 게인 하나를 곱하는 정규화로는 못 푼다. 구간별 정규화(ffmpeg `dynaudnorm`)는 Phase 1에서 오인식이 더 많았다(`docs/phase1-results.md`)

## 받아쓰기 (2026-10-11, Phase 번호 밖)

"이 정도 속도면 타자 대신 말로 입력할 수 있겠다"는 사용자 기획에서 시작했다. 어느 앱에서든 전역 단축키로 켜고 말하면 말이 끊길 때마다 인식한 조각을 커서 자리에 넣는다.
네 갈림길은 2026-10-11 사용자가 정했다 — 전역 적용 · 토글 · 규칙 기반 다듬기 · 조각 삽입. 설계는 `architecture.md` "받아쓰기", 결정 표는 `SKILL.md` 1절, 수치는 `docs/dictation-results.md`(측정 뒤 생성).
측정 → 계약 → 삽입 도구 → 인식·다듬기 → 패널·단축키·설정 순서로 진행한다. "실시간 스트리밍 STT 금지"(4절 범위 절제)의 두 번째 사용자 결정 예외이고, 문서를 먼저 고쳤다. 스키마 변경·새 모델은 없다.

### 측정 (먼저)

- [x] 지연: `scripts/dictationLatencyBench.ts` — Zeroth 낭독 문장을 3·8·15·20·30초로 이어 붙여 spawn → 텍스트 시간(turbo, 성능 코어 스레드, 용어 프롬프트 유무). 구간 길이와 무관하게 1.1~1.6초, 30초는 whisper 창 경계에서 잘림 → `DICTATION_MAX_WINDOW_SEC = 20` 확정 (2026-10-11)
- [x] 다듬기: 규칙 적용 전후 CER — `zeroth100`에서 비음성·간투사·공백 규칙은 변화 없음(8.49%), 내장 읽기 사전 치환은 `이슈` → `Issue`로 +0.12pt라 **뺌**(전역 용어 사전만 치환) (2026-10-11). 간투사가 섞인 자체 녹음 20문장은 실제 세션에서 모아 뒤에 잰다
- [x] 삽입: TextEdit(메모 대용)·Electron 창(Slack·Notion·VS Code 대용)에서 연속 삽입·클립보드 원복(텍스트)·`PASTE_SETTLE_MS`(20ms부터 정상, 200ms 유지)·개발 모드 접근성 권한 귀속(물려받음)을 확인했고, **두 번째 ⌘V부터 들어가지 않던 결함을 고쳤다**(Command 키 이벤트 동봉) (2026-10-11, `docs/dictation-results.md` 3절)
  - [ ] 사용자 확인: Slack·Notion·Chrome·VS Code·터미널 실제 앱, 파일 참조 클립보드 원복, 한글 조합 중 입력란, 보안 입력, 패키징 빌드의 권한 귀속 (이미지 PNG 원복은 2026-10-11 도구 수준에서 확인)
- [x] 결과를 `docs/dictation-results.md`에 기록하고 `architecture.md` "받아쓰기"의 최대 구간 길이·settle 시간을 확정값으로 고쳤다

### 계약 (측정 뒤, 코드 전)

- [x] `src/shared/ipc.ts` — `dictation.*` 채널 7개(`openAccessibilitySettings` 포함), `events.dictationState` / `events.dictationCommand`, `DictationStateEvent` · `DictationCommandEvent`
- [x] `src/shared/types.ts` `AppSettings.dictationShortcut`, `src/shared/shortcut.ts` `DEFAULT_DICTATION_SHORTCUT`, `db/settings.ts` 읽기·쓰기
- [x] `data-model.md` `shortcut.dictation`, `distribution.md` 5절 바이너리 표, `.claude/rules/project-structure.md` 도메인 표 `dictation`, `pitfalls.md` "받아쓰기" (2026-10-11 문서 선행)

### 삽입 도구

- [x] `native/textInsert/main.swift` — 규약(stdin 텍스트, 종료 코드 0/1/2/3/4, NSPasteboard 전체 저장·원복, ⌘V CGEvent, 자기 앱 최전면 확인, `--settle-ms=` 측정 인자) + `scripts/setupBin.ts` 빌드 단계(`SWIFT_TOOLS`) + `bin/paths.ts`
- [x] `src/main/dictation/insert.ts` — 접근성 확인(`isTrustedAccessibilityClient`, 첫 시작에 prompt), 도구 spawn(5초 타임아웃), 직렬화(한 번에 하나), 실패 시 `electron.clipboard` 폴백 + 안내
- [x] 서명·공증 대상 확인 — `resources/bin/darwin-arm64/`에 두므로 `systemAudioTap`과 같이 `asarUnpack`·서명 대상이다 (`distribution.md` 5절 표)

### 인식·다듬기

- [x] `src/main/audio/whisperOnce.ts` — `liveTranscript.ts`의 실행부를 공용 함수로 뽑았고 라이브가 그대로 쓴다. 프롬프트 옵션(용어 사전, `-mc` 토큰 수 + 1은 `whisperPrompt.ts`의 `resolveTermPrompt`를 파이프라인과 공유)
- [x] `packages/core/src/dictation.ts` — 비음성 표기 제거 · 간투사 제거(어절 전체 일치) · 용어 표기 치환(전역 용어 사전만, 측정 뒤 `TERM_READINGS` 제외) · 공백 정리 · 조각 연결(첫 조각 공백 없음) + vitest 19개
- [x] `src/main/dictation/session.ts` — 시작/정지/청크, `liveWindow.ts`의 `planCommit`으로 확정, 중간 인식 없음, `DICTATION_MAX_SEC` 300초 자동 종료(위젯에 정지 지시), `lastResult`, 녹음과 상호 배제(`assertNotDictating`을 녹음 시작 핸들러가, `isRecording`을 받아쓰기 시작이 본다), 상태 push. 순수 부분(`planCommit`)은 `liveWindow.test.ts`

### 패널·메뉴바·단축키·설정

- [x] 위젯 패널 받아쓰기 보기 `recording/WidgetPanelSection/ui/DictationView` — 상태·경과·레벨·마지막 조각·중지·⌘V 안내. 숨긴 패널은 세션 동안만 `showInactive`(`windows/widget.ts` `setWidgetShownForDictation`), 끝나면 이전 상태로
- [x] 위젯 renderer 마이크 그래프의 청크 목적지 분기 — 그래프 생성을 `shared/utils/microphoneGraph`로 뽑아 `useRecorder`와 `useDictationRecorder`(`dictation:chunk`, `dictation:command` 구독)가 같이 쓴다
- [x] Tray: `✎ 0:12` 제목, "받아쓰기 시작/정지"(녹음 중 비활성), "마지막 받아쓰기 복사"(결과 있을 때만 활성)
- [x] 전역 단축키 `shortcut.dictation`(기본 `⌥⌘D`), 세 단축키 상호 배제, 설정 "단축키" 카테고리에 행 추가
- [x] 설정 "받아쓰기" 카테고리 `setting/DictationSection` — 사용법 한 줄(현재 단축키), 접근성 권한 상태·시스템 설정 열기(창 포커스 때 다시 읽음) + `test.tsx`
- [x] 사전 `dictation.*` (`ko`·`en`), preload `window.api.dictation`, renderer `shared/api/dictation`, `useDictation`(상태·제어) · `useDictationRecorder`(그래프) 훅, `WidgetPanelSection/test.tsx`에 받아쓰기 흐름 5개
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과 (2026-10-11)
- [x] 완료 기준: `pnpm dev`에서 메모 앱에 커서를 두고 `⌥⌘D` → 두 문장을 말하고 1초 쉬면 첫 문장이 2초 안에 들어가고, 다시 `⌥⌘D`로 끝내면 나머지가 들어간다. 클립보드에 있던 이미지가 원복된다. 접근성 권한을 끄면 같은 흐름이 "복사됐습니다. ⌘V로 붙여 넣으세요"로 동작한다. 녹음 중 `⌥⌘D`는 안내만 뜬다
  — 2026-10-11 빌드된 앱을 별도 userData로 띄워 확인: toggle 경로로 마이크 그래프가 뜨고, Zeroth 낭독 두 문장을 청크 경로로 흘리면 첫 문장이 1초 침묵 뒤 **1.2~1.3초**에 TextEdit에 들어가고 정지하면 나머지가 들어간다(CER 0%). 텍스트 클립보드 원복, 녹음 중 안내, 받아쓰기 중 녹음 거절 확인. **사람 목소리·이미지 클립보드·접근성 권한 끈 흐름은 사용자 확인** (`docs/dictation-results.md` 3절)

## Phase 6: 개인 비서 모드 (2026-10-20 착수, 2026-10-21부터 본선)

회의록 앱을 개인 비서로 넓힌다 — 사용자가 고른 작업 폴더를 대상으로 앱 안에서 에이전트(Claude Code·Codex CLI)에게 질문하고 마크다운 문서를 만들거나 고친다.
**2026-10-21 사용자 결정으로 앱이 AI 비서로 피벗했다** — 이 Phase가 주 기능이고 개발의 본선이다. 위 Phase 1~5와 Phase 번호 밖의 회의록·받아쓰기 항목은 보조 기능의 유지보수다 (`SKILL.md` "제품 방향").
비서가 "진짜 비서처럼 돌아다니는" 방향(2026-10-21 사용자 발언)의 구체 형태는 아직 정하지 않았다 — 정하면 아래 "다음 단계"에 항목으로 먼저 적는다.
녹음 기록을 비서에게 잇는 연결은 2026-10-21 사용자가 정했다 — 아래 "녹음 기록 자동 정리" 절, 설계는 `architecture.md` 같은 이름의 절.
출처는 GitHub 이슈 geongyu09/meeting-stt#1 (2026-10-20 사용자 작성). 설계는 `architecture.md` "개인 비서 모드", 결정 표는 `SKILL.md` 1절.
이슈의 "정할 것" 세 가지(화면 나누기·대화 기록 저장·기본 권한 모드)는 착수하며 1차로 정했고 사용자 확인을 기다린다 (`architecture.md` 같은 절의 표).
피처 브랜치 `feat/assistant-mode`(main 기준)에서 진행한다.

### 문서 (먼저)

- [x] `SKILL.md` 1절 결정 표·3절 현재 위치·4절 범위 절제, `architecture.md` "개인 비서 모드"(에이전트 실행 경로·대화 상태·문서 에디터·IPC·화면), `data-model.md` `assistant.*` 키, `pitfalls.md` "개인 비서 모드", `.claude/rules/project-structure.md` 도메인 `assistant` (2026-10-20)

### 작업 폴더 설정

- [x] `db/settings.ts` `assistant.folder`·`assistant.permissionMode`, `assistant/folder.ts`(대화상자·상태 확인·git 여부), IPC `assistant.status`·`chooseFolder`·`setPermissionMode` (2026-10-20)
- [x] 설정 "개인 비서" 카테고리 `setting/AssistantSettingSection` + `test.tsx` (2026-10-20)

### Claude CLI 에이전트 실행과 채팅 화면

- [x] `bin/spawn.ts` `runBinary`에 취소용 `signal` — abort 뒤 실제 종료까지 기다리고 3초 뒤 SIGKILL + `spawn.test.ts` (2026-10-20)
- [x] `assistant/claudeStream.ts` — 인자 조립·stream-json 줄 해석(세션 id·글 조각·도구·결과) + vitest(실측 출력 픽스처 `fixtures/claudeStreamV2_1_304.jsonl`) (2026-10-20)
- [x] `assistant/claudeAgent.ts`·`assistant/session.ts` — spawn·취소·`--resume`, 대화 상태 push(50ms 모음), IPC `assistant.state`·`send`·`cancel`·`reset`, `events.assistantState` (2026-10-20)
- [x] 사이드바 "비서" 링크, `/assistant` 페이지, `assistant/AssistantChatSection` + `test.tsx` (2026-10-20)

### 문서 에디터

- [x] `assistant/workspacePath.ts`(경로 검증, vitest)·`assistant/files.ts`(목록·읽기·쓰기·`fs.watch`), IPC `assistant.listFiles`·`readFile`·`writeFile`, `events.assistantFilesChanged` (2026-10-20)
- [x] `assistant/DocumentEditorSection` — 파일 목록·textarea·저장(⌘S)·외부 변경 안내·문서를 바꾸거나 떠날 때 저장, 채팅의 바뀐 파일 열기 + `test.tsx`·`utils/mergeExternalChange.test.ts` (2026-10-20)

### 마무리

- [x] 사전 `assistant.*`(`ko`·`en`), `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과 (2026-10-20)
- [ ] 완료 기준: `pnpm dev`에서 git 저장소인 작업 폴더를 고르고 "회의 메모 템플릿을 notes/template.md로 만들어 줘"를 보내면 답이 흘러나오며 `Write notes/template.md`가 표시되고, 바뀐 파일을 누르면 에디터에 열린다. 에디터에서 고쳐 ⌘S로 저장하고 "방금 파일에 내가 뭘 바꿨는지 말해 줘"로 대화가 이어진다. 실행 중 "중지"가 프로세스를 끝낸다
  — 2026-10-20 빌드된 앱을 별도 userData로 띄워(playwright-core, 폴더 대화상자만 대체) git 저장소 임시 폴더로 확인: 질문 → 15초 안에 `Write notes/template.md`와 바뀐 파일 버튼, 누르면 에디터에 열림, 편집 후 ⌘S 저장이 디스크에 반영, 편집 중이 아닐 때 밖에서 바꾼 내용이 에디터에 반영, 이어 물은 "내가 추가한 섹션"에 `## 다음 할 일`로 정답(`--resume`), 긴 작업 6초 뒤 "중지" → "중지했습니다"와 `claude -p` 프로세스 없음, "새 대화"로 비움. **`pnpm dev`에서 사람이 실제 작업 폴더로 확인하는 것이 남았다**

### 다음 단계

- [x] Codex CLI 에이전트 실행 — `codex exec --help`(0.163.0)로 `exec resume`·`--json`을 확인해 `architecture.md`에 인자·이벤트를 적고, `assistant/codexStream.ts`(+ 실측 픽스처 `fixtures/codexStreamV0_163_0.jsonl` vitest)·`assistant/codexAgent.ts`, 세션의 공급자 분기, 채팅의 에이전트 선택(설치된 첫 CLI 기본)을 붙였다 (2026-10-20)
  — 빌드된 앱에서 Codex로 파일 생성(`Add notes/codex.md`, workspace-write 샌드박스) → 바뀐 파일을 에디터로 열기 → `exec resume`으로 이어 묻기를 확인. 이 기기에는 codex가 설치돼 있지 않아 npx 캐시의 0.163.0을 로그인 셸 조회 대신 넘겨 확인했다. **실제 설치(Homebrew·npm 전역·ChatGPT 앱 동봉) 경로에서의 사용자 확인이 남았다**
- [ ] 빠른 질문 모드 (로컬 모델 포함) — 키워드로 문서를 먼저 찾아 한 턴 호출

### 채팅창 리뉴얼 (2026-10-21 시안, `features/ui.md` 같은 이름의 절)

- [x] 홈 화면부터 채팅 플로우 — 토큰 값 교체, `/` = 채팅(사이드바 밖)·옛 홈 `/meetings`, 도우미 6개 + 입력 도크, `/` 명령 메뉴(내장 명령 + 스킬, `assistant:listSkills`)·`@` 파일 선택, 턴(말풍선·도구 라벨·바뀐 파일 칩·작업 중), 문서 패널(옆 카드·닫기) + 통합 테스트·순수 함수 vitest (2026-10-22)
  — 같은 날 빌드된 앱을 별도 userData로 띄워(playwright-core, 폴더 대화상자만 대체) 확인: 홈 도우미·`/` 메뉴(내장 + 스킬)·`@` 파일 메뉴·실제 Claude Code 턴("고침 notes/hello.md" 줄과 칩)·칩으로 문서 패널 열기·닫기·다크 모드까지 시안과 같은 모양. **`pnpm dev`에서 사람이 실제 작업 폴더로 확인하는 것이 남았다**
- [x] 녹음 카드(입력창 위에 붙는 녹음 중, 녹음 후 기록 카드) — `recording/RecorderSection`을 시안 카드로 재작성(녹음 중에만, 페이지가 `recorderSlot`으로 넘김), `features/meeting/RecordCard`(처리 중·실패·완료: 요약·복사·삭제 2단계·화자 범례·교정 수, "전체 기록 보기"는 아직 회의 상세로), 채팅의 "녹음을 시작했어요/멈췄어요" 줄(`location.state.stoppedMeetingId`)과 입력 도크 아래 단축키·품질·오류 안내, 정지 후 `/`로 이동, 도우미 "파일로 기록 만들기"가 `useAudioImport`(이동 없음), 위젯 패널 시안 외형·알약 `Stepper`, 시스템 오디오 스위치를 설정 "마이크"로, 옛 녹음 화면 `/record`는 시작 후 `/`로 보내는 shim + 통합 테스트(`RecorderSection`·`RecordCard`·채팅·설정) (2026-10-22, `features/recording.md` "채팅 창의 녹음"). 빌드된 앱을 가짜 마이크(`--use-fake-device-for-media-stream`)로 띄워 마이크 버튼 → 녹음 카드(파형·라이브·타이머·안내 줄) → 정지 → "녹음을 멈췄어요" 줄 + 기록 카드(처리 중 → 완료) → "전체 기록 보기" 패널 → 기록 찾기 결과 → 패널 열기까지 스크린샷으로 확인했다(2026-10-22). 실제 마이크·긴 녹음의 사람 확인은 평소 사용에서 한다. 노트 칸은 2026-10-22 카드에 붙였다(아래 "녹음 노트" 절), 회의/메모 종류 선택은 그 기능이 붙을 때 헤더에 둔다
- [x] 최근 녹음 줄 — 기록을 대화에 쌓지 않고 입력창 위 한 줄(최근 10개, 좌우 스크롤)에 모은다. 항목을 누르면 기록 카드가 줄 위에 펼쳐지고(막 멈춘 녹음은 펼친 채로), 마우스를 올리면 나오는 x로 목록에서만 뺀다(localStorage). `StoppedRecordDock`·대화 속 기록 카드·"녹음을 멈췄어요" 줄을 없앴다 + 통합 테스트 (2026-10-22 사용자 요청, `features/recording.md` "최근 녹음 줄"). **`pnpm dev` 사람 확인이 남았다**
- [x] ~~대화 중 도우미 줄 — 턴이 있으면 같은 도우미 6개를 입력 도크 아래 한 줄의 작은 상자로 둔다(`HelperGrid isCompact`)~~ → 같은 날 아래 항목으로 없앴다
- [x] 도우미 상자 제거·설정 톱니 — 홈 그리드·대화 중 줄(`HelperGrid`)을 지우고 기능은 `/` 명령으로만 연다. 설정은 제목 표시줄 오른쪽 위 톱니 버튼으로도 연다 + 통합 테스트를 `/` 메뉴로 바꿈 (2026-10-22 사용자 결정, `features/ui.md` "홈"). **`pnpm dev` 사람 확인이 남았다**
- [x] 새 대화 단축키 — `⌘N`(`AppSettings.newChatShortcut`, `shortcut.newChat`)으로 `/` 명령 "새 대화"를 실행하고 설정 "단축키"에서 바꾸거나 끈다. 채팅 창 `keydown`(전역 아님), 전역 단축키와 중복 거절, `useSettings`가 `settings:changed` push 구독 + 통합 테스트 (2026-10-22 사용자 요청, `features/ui.md` "채팅창 리뉴얼")
- [x] 설정 단축키 — `⌘,`(고정)로 설정 모달을 연다. 메인 창 레이아웃 `keydown`, 하위 화면에서는 `replace` + 통합 테스트 (2026-10-22 사용자 요청, `features/ui.md` "설정 모달")
- [x] 전체 기록 패널·기록 찾기(결과가 대화에) — `meeting/TranscriptSection`을 채팅 옆 600px 카드(헤더·화자 칩 줄·발화 목록·녹음본 줄·닫기)로 재작성해 기록 카드의 "전체 기록 보기"와 찾기 결과가 연다. `/` 명령 "기록 찾기"는 도크의 찾기 모드(칩 + Enter → `meetings:search`) → 대화 속 결과 카드(`ui/SearchResultCard`, `shared/utils/highlightMatch`). 사이드바·`/meetings`·`/meetings/:id`·`/record`·`RequireModels`·`meeting/SummarySection`을 지웠다 + 통합 테스트 (2026-10-22, `features/recording.md` "전체 기록 패널"·"기록 찾기"·"옛 페이지 제거"). 남은 옛 화면은 `/summary-templates`(설정에서 들어오는 전체 창)뿐이다
- [x] 설정 모달 (보드 "설정 · 큰 모달로 열림", 설계는 `features/ui.md` "설정 모달") — 문서를 먼저 고쳤다 (`features/ui.md` 새 절·라우트 표·공통 컴포넌트 표, `features/assistant.md` IPC·화면, `data-model.md` `assistant.provider`, `architecture.md` IPC 목록, `SKILL.md` 개인 비서 행). 경로는 `/settings` 그대로이고 설정으로 가는 링크는 바꾸지 않았다 (2026-10-22)
  - [x] 계약: `AssistantStatus.provider`, `assistant:setProvider`(`SetAssistantProviderRequest`), `readAssistantProviderPayload` + vitest (2026-10-22)
  - [x] main: `db/settings.ts` `assistant.provider`, `assistant/folder.ts`가 저장값 없으면 설치된 첫 CLI(Claude Code → Codex)로 채움, `ipc/assistant.ts` 핸들러, preload, `api/assistant` `setAssistantProviderApi` (2026-10-22)
  - [x] `pages/Settings` = `<dialog>` 모달(헤더 60px·카테고리 nav 220px·본문 760px, `showModal`, 닫기·Esc·배경 클릭 → 이전 화면), `constants/categories.ts`·`ui/CategoryNav`·`ui/CategoryContent`, `composites/PageToc` 삭제 (2026-10-22)
  - [x] `setting/SettingsSection` `category` prop(여덟 묶음 중 하나, `children` 삭제), `setting/AssistantSettingSection` "에이전트" 행(대화 중 비활성) + 통합 테스트, 채팅은 `state.provider ?? status.provider`로 보냄 (2026-10-22)
  - [x] 시안 값: `SettingGroup` 제목 본문색 15px, `SettingRow` 14px/13px·세로 가운데, `Switch` 40×24, 설정 `<select>`·단축키 칸 34px, `--color-backdrop` 토큰(라이트·다크) (2026-10-22)
  - [x] 설정 위젯 통합 테스트·`assistant.test.ts`(100개) 통과, 바꾼 파일 eslint·prettier 통과, `electron-vite build`한 앱을 별도 userData로 띄워 라이트·다크에서 모달·14 카테고리·Esc 닫기 확인 (2026-10-22)
  - [x] `/settings`를 채팅 라우트(`/`)의 자식(`pages/Assistant`의 `<Outlet />`)으로 옮겨 모달 뒤에 채팅이 보인다. `Button` 알약형(`--radius-full`, `md` 34px) (2026-10-22)
  - [x] 저장소 전체 `pnpm build`(typecheck 포함)·`pnpm test`·`pnpm lint` 통과 — 다른 세션이 더한 `RecordingStateEvent.note`·`MeetingDetail.note`의 테스트 픽스처 다섯 곳에 `note: ''`를 채웠다. 같은 시각 다른 세션들의 옛 페이지 제거·기록 패널 작업이 끝난 뒤 마지막으로 다시 돌려 빌드·테스트 734개(데스크탑)·린트 모두 초록이고, 그 빌드로 모달·Esc 닫기를 다시 확인했다. 설정 모달 코드는 `4ce5387`, 채팅 라우트 자식·`Outlet`은 `93570e3`에 커밋돼 있다 (2026-10-22)
  - [x] 설정으로 오는 링크가 `state.category`로 카테고리를 넘길 수 있다 — 요약 템플릿 편집의 "설정으로"가 "요약 템플릿"으로 연다 (2026-10-22)
  - [x] 완료 기준 확인 (2026-10-22): `pnpm dev`(별도 `--user-data-dir`, CDP로 붙음)에서 `/settings`가 채팅 위 모달로 뜨고(`:modal`, 뒤에 입력 도크), 카테고리 전환·Esc 닫기·요약 템플릿 편집 → "설정으로" → "요약 템플릿" 카테고리까지 확인. 빌드된 앱에서 14개 카테고리 전부(요약 · 용어 초안은 CLI 탐색이 끝난 뒤 다섯 방식 라디오까지) 그려지고 오류 표시가 없음을 확인. 에이전트 전환은 작업 폴더를 넣은 앱에서 Codex를 고르면 채팅에 "Codex CLI를 찾지 못했습니다"가 뜨며 입력이 막히고(이 기기에는 Codex가 없다), Claude Code로 되돌리면 안내가 사라지고 입력이 살아나며, 앱을 다시 열어도 고른 값이 남는 것으로 채팅까지 이어짐을 확인. 대화 중 비활성은 통합 테스트로 확인. 실제 Codex 턴은 Codex가 설치된 기기에서만 볼 수 있다(Codex 턴 자체는 2026-10-20 npx 캐시 0.163.0으로 확인한 바 있다)
- [x] 처음 실행 (설정도 대화로) — `assistant/SetupSection`(작업 폴더·음성 인식 모델 카드, 합산 진행 줄, 나중에 받기 `localStorage`, 준비 완료 + "녹음 시작" 칩) + `test.tsx`·`utils/summarizeDownload` vitest, `useAssistantStatus` 모듈 캐시, `shared/utils/planDownload`로 올림, 사전 `setup`, `RequireModels`를 `/record`에만·`/`로 보냄, `pages/Onboarding`·`/onboarding`·`models.onboarding` 삭제 (2026-10-22, `features/ui.md` "처음 실행"). **`pnpm dev` 사람 확인이 남았다** — 빈 `userData`로 띄워 폴더 고르기 → 받기 → 준비 완료 칩, "나중에 받기" 뒤 재실행 시 카드 없음
  - [ ] 미룬 것: "받기 취소"(다운로드 취소 IPC), 완료 카드의 모델 "바꾸기", "파일로 기록 만들기"·"/ 로 명령 보기" 칩, 카드를 채팅 스크롤 안으로(섹션 슬롯), 모델 없이 녹음 시작 막기
- [x] 첫 화면 (작업 폴더만) — `routes/guards.tsx` `RequireFolder`(메인 창 라우트 전체, 폴더 `null`이면 `pages/Welcome`으로 자리 바꿈) + `assistant/WelcomeSection`("폴더 고르기" 하나) + `guards.test.tsx`, 사전 `setup.welcome` (2026-10-22, `features/ui.md` "첫 화면"). **`pnpm dev` 사람 확인이 남았다** — 빈 `userData`로 띄워 첫 화면만 보이고 설정·채팅이 없는지, 폴더를 고르면 같은 자리에 채팅(모델 카드)이 서는지
- [x] 답변 마크다운 렌더러 — `primitives/ui/Markdown`(`react-markdown` + `remark-gfm`, 링크는 `_blank`로 main이 브라우저에 연다) + `test.tsx`, `TurnList`의 답변 글에 적용, 답변 아래 "답변 복사" 버튼(`ui/CopyAnswerButton`, 마크다운 원문을 한 번에) + 통합 테스트 (2026-10-22, `features/ui.md` "대화"). 녹음 노트 렌더링은 "녹음 노트" 절의 후속 그대로. **`pnpm dev` 사람 확인이 남았다** — 표·코드 블록·링크(브라우저로 열림)·복사 뒤 체크 표시

### 녹음 기록 자동 정리 (2026-10-21)

녹음을 멈추면 STT → 화자 분리(회의만) → 작업 폴더 `raw/recordings/`에 원문 저장 → 정리 에이전트 → 알림이 자동으로 이어진다. 결정 10가지는 2026-10-21 사용자가 골랐다 (`architecture.md` "녹음 기록 자동 정리" 표).
문서를 먼저 고쳤다 (`SKILL.md` "제품 방향", `architecture.md` 같은 이름의 절·"전역 단축키", `data-model.md` 마이그레이션 9(녹음 노트가 8을 먼저 가져감)·`recording.type`·`shortcut.memo`·`assistant.autoOrganize`).

1차(2026-10-22, 사용자 지시 "다 자동이야")는 원문 저장 → 정리 → 알림 사슬과 설정 스위치만 붙였고, 녹음 종류·자동 제목·상세 줄은 남겼다 (`features/assistant.md` 같은 절 "구현 상태").

- [x] 계약(1차): `AssistantStatus.isAutoOrganizeEnabled`, IPC `assistant.setAutoOrganize`·`events.assistantOpenFile`
- [x] 계약(녹음 종류, 2026-10-26): `RecordingType`·`Meeting.recordType`·`RecordingStateEvent.recordingType`·`AppSettings.memoShortcut`, IPC `recording.setType`. `OrganizeStatus`·`organize.status`·`events.organize`는 2026-10-24 기록 카드 줄과 함께 붙었다
- [ ] 계약(남음): IPC `organize.send`
- [x] DB(1차): 마이그레이션 9(`brain_path`), 설정 키 `assistant.autoOrganize`
- [x] DB(2026-10-26): 마이그레이션 10(`record_type`), 설정 키 `recording.type`·`shortcut.memo`
- [x] 녹음 종류 (2026-10-26): 세션의 종류 값·`recording:setType`, 정지 시 `record_type`·메모 기본 제목·참석자 수 미저장, 메모 단축키(녹음 중이면 정지)와 다섯 단축키(새 대화 포함) 중복 검사, Tray "회의 녹음 시작"·"메모 녹음 시작"
- [x] 파이프라인 (2026-10-26): 메모는 화자 분리를 spawn하지 않고 화자 구간 하나(`speakerLabelOf(0)`)로 병합(군소 화자 흡수 끔), `diarize` 진행률 100% 한 번. 다시 인식도 저장된 종류를 따른다
- [x] 원문·정리 지시 (2026-10-26): 메모 원문은 머리말 `종류: 메모`·참석자 줄 없음·발화를 문단으로(vitest), 정리 지시의 "방금 끝난 {회의|메모}"
- [x] 원문 파일 `assistant/recordNote.ts` — 경로(`raw/recordings/YYYY-MM-DD-HHmm[ 주제][-n].md`, `wx`, 주제는 제목에서 날짜를 뗀 것)·머리말·본문 조립(순수 함수 + vitest: 회의·이름 충돌·화자 이름·노트). 메모 본문 형식은 녹음 종류와 함께
- [x] 정리 `assistant/organize.ts` — 정리 큐(동시성 1, GPU 큐와 별개), 자동 교정 잡 뒤 트리거·처음 처리만 자동(`brain_path`), 설치된 첫 CLI·고정 지시·새 세션·10분 제한·앱 종료 시 중단. 상태 Map + `organize:progress`는 2026-10-24 기록 카드 줄과 함께 붙였다
- [x] 녹음 노트 잇기: 원문의 `## 노트`·`## 전사`(노트가 있을 때만), 정리 지시의 노트 두 문단, Claude 정리 턴에 노트 링크 호스트만 `WebFetch(domain:…)` 허용
- [x] 알림 `windows/notify.ts` — 완료·실패 알림, 누르면 메인 창 `/assistant`에서 원문 열기(`assistant:openFile`)
- [x] 화면(1차): 설정 "개인 비서" 자동 정리 스위치
- [x] 기록 카드 "비서의 뇌" 줄 (2026-10-24 사용자 요청) — 상태 Map + `organize:status`·`organize:progress`, 정리 상태 + 원문·바뀐 파일 칩(실패해도 그때까지 바꾼 파일), 칩을 누르면 문서 패널에서 열어 고치기. 통합 테스트(기록 카드·채팅의 칩 → 문서 패널)
- [ ] 원문·요약 분리 (2026-10-24 사용자 결정 — 코드·테스트 완료, `pnpm dev` 확인 남음, `features/assistant.md` "원문 동기화와 요약 파일")
  - [x] 순수 함수 + vitest: `recordSummaryPathOf`(`src/shared/assistant.ts`), `extractLegacySummary`(`recordNote.ts` — 노트 있음·없음·요약 없음·요약 안 `##` 제목)
  - [x] 정리 지시: 원문은 읽기만, 요약은 요약 파일에, `### 반영한 곳`·`### 확인 필요`도 요약 파일에. 기본 하네스 `recording` 스킬도 같게. 알림은 요약 파일을 먼저 연다
  - [x] 원문 동기화 `syncRecordNote`: 편집 IPC 7개 뒤, 교정 반영 뒤, 사슬 끝(이미 보낸 회의). 직렬 쓰기, 같으면 안 씀, 파일 없으면 안 만듦, 옛 원문의 `## 요약`은 요약 파일로 옮긴 뒤 다시 씀
  - [x] "요약 만들기" 결과를 원문이 있는 회의의 요약 파일에도 쓴다
  - [x] 기록 카드 요약 칸: 요약 파일이 있으면 그 내용 + 인라인 편집(`assistant:writeFile`), 다시 읽기(마운트·정리 상태·요약 완료·파일 변경), 없으면 예전대로. 사전(`ko`·`en`), 통합 테스트(파일 요약 표시·고쳐서 저장)
  - [ ] 완료 기준: 앱에서 발화를 고치면 원문 파일의 그 줄이 바뀌고, 요약 파일은 그대로다. 기록 카드에서 요약을 고치면 요약 파일이 바뀐다. 옛 원문은 처음 동기화 때 `## 요약`이 요약 파일로 옮겨지고 원문에서 빠진다
- [x] 화면(녹음 종류, 2026-10-26): `features/recording/RecordingTypeToggle`(두 칸 세그먼트) — 위젯은 참석자 수와 한 줄(창 높이 고정), 녹음 카드는 헤더(보기 토글 왼쪽), 메모면 참석자 수 숨김. 기록 카드·전체 기록 패널·최근 녹음 줄 메타에 "메모"(메모는 화자 수·범례 대신). 설정 "단축키" 메모 행, Tray 두 시작 항목. 통합 테스트(녹음 카드·위젯 종류 선택·설정 메모 단축키)
- [ ] 화면(남음): "비서의 뇌" 줄의 보내기/다시 정리(`organize:send` — 2026-10-24부터 원문을 덮지 않고 정리만 다시)·전체 기록 패널의 같은 줄
- [x] 사전(`ko`·`en`) 문구(1차: 스위치·알림·오류), 통합 테스트(설정 스위치)
- [ ] 통합 테스트(남음): 보내기/다시 정리
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과
- [ ] 완료 기준: `pnpm dev`에서 작업 폴더를 고른 상태로 `⌥⌘M` → 말하고 → `⌥⌘M`으로 정지하면 화자 분리 없이 처리되고, `raw/recordings/<시각> <주제>.md`가 생긴 뒤 에이전트가 폴더 규칙대로 정리하고 요약은 원문 옆 `<시각> <주제> 요약.md`에 쓴 뒤 macOS 알림이 뜬다. 알림을 누르면 비서 화면에 원문이 열린다. `⌥⌘R` 회의는 화자 분리가 돈다. 자동 정리를 끄면 원문만 생기고 알림이 없다. CLI가 없거나 폴더가 사라지면 실패 알림이 뜨고 회의록은 앱에 남는다

### 회의록 자동 제목 (2026-10-21)

녹음 중에 제목을 입력하는 대신, 처리가 끝나면 `YYYY-MM-DD <주제>`로 제목을 붙인다. 외부 공급자는 이미 자동 전송에 동의한 경우에만 쓴다 (2026-10-21 사용자 결정, `features/transcript.md` "회의록 자동 제목").
문서를 먼저 고쳤다 (`SKILL.md` 1절 표, `features/transcript.md` 새 절, `features/assistant.md` 흐름·원문 파일 이름·알림·스위치 설명, `data-model.md` `meetings.title`·자동 제목 저장 쿼리). 스키마·IPC 변경은 없다.
2026-10-22 사용자 지시("만들어")로 코드를 붙였다. 같은 날 사용자 결정으로 입력에 녹음 노트를 더하고("녹음 중에 기록한 것들이랑 전사된 내용 기반으로") 프롬프트는 회의·메모 대신 "녹음"으로 부른다("회의 아니고 녹음이야").

- [x] 사전: 외부 자동 교정·녹음 기록 자동 정리 스위치 설명에 제목 전송 한 줄 (2026-10-22)
- [x] 사전: 기본 제목을 전사 전 임시 이름 `YYYY-MM-DD 녹음`(`Recording YYYY-MM-DD`)으로, 예전 `회의`·`Meeting`은 `legacyDefaultTitle`로 남겨 `isDefaultTitle`이 함께 본다 (2026-10-22 사용자: "stt 하기 전에는 임시 이름으로만")
- [x] 사전 (2026-10-26): 메모 기본 제목(`main.recording.memoDefaultTitle`, `ko`·`en`)을 녹음 종류와 함께 넣고 `isDefaultTitle` 판정에도 넣었다(vitest)
- [x] 순수 함수 `src/shared/autoTitle.ts` + vitest — 입력 자르기(처음·가운데·끝), 노트 앞붙이기(`clipNote`), `cleanTitleTopic`(따옴표·`#`·`제목:`·날짜·마침표·여러 줄·30자·빈 답), `isDefaultTitle`(회의 × `ko`·`en`, 다른 날짜), 최종 제목 조립. `recordNote.ts`도 같은 `isDefaultTitle`을 쓴다 (2026-10-22)
- [x] 잡 `src/main/title/run.ts`: GPU 큐 `{ kind: 'title' }`, `autoTitleSkipReason`(기본 제목 아님·발화 없음·LLM 미준비·외부인데 동의 없음), 자동 교정 끝 → 제목 → 정리 잡 연결, 조건부 UPDATE(`updateAutoTitle`) + `meetings:changed`, 실패는 경고 로그만 (2026-10-22)
- [x] 로컬 한 줄 GBNF(`[^\n]{1,60}`)·`TITLE_MAX_TOKENS`(48), 외부는 첫 줄만 (2026-10-22). 동봉 `llama-cli` + Qwen3-4B로 노트·전사 예시 한 번 돌려 문법이 읽히고 "이사 후보지와 전세 대출 확인"을 낸 것을 확인했다
- [ ] 측정 — 실제 회의·메모 녹음 몇 개(71분 회의, 짧은 메모)로 로컬 4B와 외부 공급자의 제목을 보고 `TITLE_INPUT_MAX_CHARS`(잠정 4,000)를 확정
- [x] desktop `test`·`typecheck`, 바꾼 파일 `eslint`, `electron-vite build` 통과 (2026-10-22)
- [ ] 완료 기준: `pnpm dev`에서 로컬 요약 모델이 있는 상태로 메모를 녹음하면 처리 뒤 사이드바 제목이 `오늘 날짜 + 주제`로 바뀌고, 처리 중에 제목을 고쳐 두면 바뀌지 않는다. 외부 공급자에서 두 동의가 모두 꺼져 있으면 기본 제목이 그대로다. 작업 폴더가 있으면 `raw/recordings/<시각> <주제>.md`와 머리말 제목이 같은 제목으로 생긴다

### 루틴 (2026-10-22)

정해진 주기마다 작업 폴더에서 에이전트에게 같은 프롬프트를 자동으로 보내고 결과를 알림으로 알린다. 갈림길 네 가지(주기 형태·결과 확인·놓친 실행·화면 위치)는 2026-10-22 사용자가 골랐다 (`features/assistant.md` "루틴").
문서를 먼저 고쳤다 (`SKILL.md` 1절 표·3절, `features/assistant.md` 새 절, `architecture.md` 목차, `data-model.md` `assistant.routines`, `.claude/rules/project-structure.md` 도메인 `routine`). 스키마 변경은 없다.

- [x] 계약: `RoutineSchedule`·`Routine`·`RoutineRun`·`RoutineInput`·`RoutinesState`, IPC `routines.list`·`save`·`delete`·`run`·`events.routinesChanged` (2026-10-22)
- [x] 순수 함수 `src/shared/routine.ts` + vitest — `nextRoutineRunAt`(간격·시각·요일 넘김·같은 날 지난 시각), `isRoutineDue`, 저장 payload 검증, 저장값 읽기(깨진 항목 버림) (2026-10-22)
- [x] `db/settings.ts` `assistant.routines` 읽기·쓰기, `buildClaudeAgentArgs`의 `isUnattended` + vitest (2026-10-22)
- [x] `assistant/routines.ts` — 30초 훑기·시작 직후 한 번, 큐(동시성 1), 채팅과 같은 에이전트·새 세션·머리말·10분 제한, 지우면 끝내기, 앱 종료 시 끝내기, `lastRun` 저장·push (2026-10-22)
- [x] 알림 `windows/notify.ts` — 완료·실패, 누르면 메인 창 (2026-10-22)
- [x] 화면 `setting/RoutineSection` — 목록(주기 요약·다음 실행·마지막 실행·스위치·지금 실행·고치기·삭제 2단계), 인라인 폼, 마지막 답 펼치기 + 통합 테스트. 설정 모달(채팅창 리뉴얼)의 "개인 비서" 카테고리에 `AssistantSettingSection` 아래로 둔다 (2026-10-22)
- [x] 사전 `routine.*`(`ko`·`en`) (2026-10-22)
- [x] 루틴 코드의 test·typecheck·lint·`electron-vite build` 통과 (2026-10-22). 전체 `pnpm typecheck`·`RecorderSection/test.tsx`는 같은 시각 다른 세션이 고치던 녹음 노트·녹음 카드 쪽 오류로 실패 중이었다
- [ ] 완료 기준: `pnpm dev`에서 작업 폴더를 고른 상태로 "10분마다 · 오늘 날짜를 notes/today.md에 적어 줘" 루틴을 만들고 "지금 실행"을 누르면 "실행 중"이 보이고, 끝나면 macOS 알림이 뜨고 목록에 마지막 답과 바뀐 파일이 보인다. 앱을 끄고 10분 넘게 지난 뒤 켜면 한 번만 다시 돈다. 스위치를 끄면 돌지 않는다
  — 2026-10-22 빌드된 앱을 별도 userData로 띄워(playwright-core, 폴더 대화상자·알림 표시만 대체) 확인: 10분 간격 루틴 저장 → "지금 실행" → "실행 중" → Claude Code 2.1.306이 12~25초 만에 `notes/today.md`를 쓰고 "완료"·마지막 답·바뀐 파일·알림 1건. **앱을 껐다 켠 뒤 놓친 실행 한 번과 스위치 끄기는 `pnpm dev`에서 사람이 확인할 것이 남았다**
- [x] 대화로 만들기 (2026-10-22 사용자 요청, `features/assistant.md` "루틴" > "대화로 만들기") — 채팅 시스템 지시 `CHAT_SYSTEM_PROMPT`(Claude `--append-system-prompt`, Codex `-c developer_instructions`), `splitRoutineProposal` + vitest, 채팅 제안 카드 + 통합 테스트, `/` 명령 "루틴 만들기", `summarizeSchedule`을 `shared/utils`로 이동. desktop test·typecheck·lint·`electron-vite build` 통과 (2026-10-22)
  - 2026-10-22 Claude Code CLI로 같은 시스템 지시를 넣고 2턴 실측: 첫 턴은 번호 목록으로 묻고, 답하자 ` ```routine ` 블록(평일 09:00, 636자 프롬프트)을 냈고 `splitRoutineProposal`이 그대로 읽었다. Codex는 설치돼 있지 않아 `developer_instructions`(특히 `exec resume`)를 확인하지 못했다
  - [ ] 완료 기준: `pnpm dev`에서 "/루틴 만들기"로 시작해 "평일 아침 9시에 오늘 할 일 정리해 줘"라고 답하면 에이전트가 몇 번 묻고 제안 카드를 띄우고, "루틴 추가"를 누르면 설정 "루틴" 목록에 그대로 생기며 카드가 "추가했어요"로 바뀐다

### 기본 하네스 (2026-10-22)

설정의 "기본 설정 추가하기"를 누르면 작업 폴더에 문서 위치와 요청별 행동을 정한 기본 규칙·폴더 구조·스킬을 넣는다(규칙 파일 `CLAUDE.md`·`AGENTS.md`가 이미 있으면 넣지 않는다). 갈림길(넣는 방식·넣는 시점(설정 버튼)·영어 폴더 이름·`raw/`의 역할·사용자별 문체·Claude·Codex 공용)은 2026-10-22 사용자가 정했다 (`features/assistant.md` "기본 하네스").
문서를 먼저 고쳤다 (`SKILL.md` 1절 "개인 비서" 행·3절, `features/assistant.md` 새 절, 녹음 원문 폴더 `기록/` → `raw/recordings/`를 `features/assistant.md`·`features/transcript.md`·이 문서·`SKILL.md`에서, `architecture.md` 목차·디렉터리). 스키마 변경은 없다.

- [x] 템플릿 `src/main/assistant/harness/` — `AGENTS.md`·`CLAUDE.md`·`tasks.md`·`backlog.md`·`wiki/{index,log}.md`·`docs/index.md`·`docs/_template/index.md`·`profile/index.md`·`profile/communication/style.md`, 스킬 8개(`todo`·`profile`·`style`·`wiki`·`project`·`draft`·`retrospective`·`recording`)
- [x] `assistant/harness.ts` — 규칙 파일이 둘 다 없을 때만, 파일은 `wx`, `skills/` → `.agents/skills/` + `.claude/skills/` 상대 링크, `raw/` 빈 폴더, 넣었는지 boolean을 돌려준다
- [x] vitest `harness.test.ts` — 빈 폴더·규칙 파일 있는 폴더·기존 파일 보존·두 번 호출, 템플릿 검사(스킬 머리말·이름 = 폴더, `AGENTS.md` 32KiB 미만, 스킬 표 = 스킬 목록)
- [x] 계약·IPC: `InstallHarnessResponse`, `assistant.installHarness`(`ipc.ts`·`ipc/assistant.ts`·preload·renderer api 래퍼)
- [x] 화면: 설정 "개인 비서"의 "기본 설정" 행(버튼·결과 줄) + 통합 테스트, 사전 `assistant.settings.harness`(`ko`·`en`)
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과 — 2026-10-22 하네스·설정 섹션 테스트, main 타입 검사, 바뀐 파일 lint·prettier, `electron-vite build`의 main 번들(템플릿 포함 확인)까지 통과. 전체 `typecheck:web`·renderer 빌드·전체 test는 다른 세션이 작업 중인 화면 파일(`pages/Recordings` 없음, `RecordCard`·`TranscriptSection`·`AssistantChatSection` 테스트)에서 막혀 다시 확인한다
- [ ] 완료 기준: 빈 폴더를 작업 폴더로 고르고 설정의 "기본 설정 추가하기"를 누르면 구조와 스킬이 생기고 `/` 메뉴에 스킬 8개가 보인다. Claude Code로 "할 일 추가해줘: 보고서 제출, 금요일까지"를 보내면 `tasks.md`에 형식대로 한 줄이 생기고, "앞으로 답할 때 반말로 해"를 보내면 `profile/communication/style.md`의 `## 답변`에 기록된다. Codex가 설치된 환경에서 같은 두 질문이 같은 결과를 낸다. 폴더를 고르기만 하면 아무 파일도 생기지 않고, `CLAUDE.md`가 있는 폴더에서 누르면 "이미 규칙 파일이 있다"는 안내만 뜬다
  — 2026-10-22 템플릿을 그대로 재현한 임시 폴더에서 Claude Code 2.1.306(`-p --permission-mode acceptEdits`, 앱과 같은 인자)으로 확인: "할 일 추가해줘: 보고서 제출, 금요일까지" → `tasks.md`에 `- [ ] 보고서 제출 — 마감 2026-10-23 (금)`, "앞으로 나한테 답할 때는 반말로 짧게 해줘" → `style.md` `## 답변`에 두 줄 + `_history/communication-style.md`, 새 세션의 "할 일 뭐 남았어?"가 반말로 답함. 남은 것: 앱에서 버튼을 눌러 보는 확인(`pnpm dev`)과 Codex(이 맥에 설치돼 있지 않음)

### 답변 읽어주기 (2026-10-25)

비서 답변 아래 복사 버튼 옆의 버튼으로 답변을 소리 내어 읽고, 목소리는 설정 "답변 읽기"에서 고른다 (2026-10-25 사용자 요청). 엔진은 renderer `speechSynthesis`(macOS 시스템 목소리)라 모델·바이너리·IPC 채널이 늘지 않는다.
문서를 먼저 고쳤다 (`SKILL.md` 1절 표, `features/ui.md` "대화"·"설정 모달", `data-model.md` `speech.voice`). 스키마 변경은 없다.

- [x] 계약: `AppSettings.speechVoice`(기본 `null`), `speech.voice` 읽기·검증(`db/settings.ts`, `ipc/handlers.ts`), `updateSettingsApi` 필드 추가
- [x] `utils/speechText.ts`(마크다운 → 읽을 글) + vitest
- [x] 채팅 `ui/SpeakAnswerButton`(복사 버튼 옆, 읽기·멈추기, 한 번에 하나) + 통합 테스트, 설정 "답변 읽기" 카테고리의 목소리 `<select>`, 사전 `ko`·`en`
- [x] desktop `test`·`typecheck`, 바꾼 파일 `eslint`·prettier 통과 (2026-10-25)
- [x] Electron 39 실측 (2026-10-25, 이 맥): 첫 `getVoices()`는 빈 배열이고 `voiceschanged` 뒤 180개(한국어 9개 — Yuna 외 Eddy·Flo 등, 모두 `localService`). `voiceURI`는 목소리 이름 그대로(`Yuna`)다. 읽기를 `cancel()`하면 `error`(`interrupted`)가 오고 `end`는 오지 않는다 — 버튼은 둘 다 받는다
- [ ] 완료 기준: `pnpm dev`에서 설정 "답변 읽기"에 macOS 목소리 목록이 보이고, 고른 목소리로 답변 읽어주기 버튼이 읽으며, 다시 누르면 멈춘다. 다른 답변 버튼을 누르면 앞의 것이 멈춘다

### 녹음 중 STT (메모, 2026-10-25)

메모 녹음은 녹음하는 동안 STT를 미리 돌려 정지 뒤 대기를 줄인다 (2026-10-25 사용자 요청 "녹음 중에 STT를 미리 돌려서 정지 후 기다리는 시간을 줄이고 싶어").
측정부터 했고, 사용자가 미리 정한 조건("차이가 없으면 메모 녹음부터")을 채웠다 (`docs/stt-tuning-results.md` "녹음 중 STT"). 문서를 먼저 고쳤다 (`SKILL.md` 1절 표·2절 파이프라인·3절·4절 범위 절제, `features/recording.md` 새 절, `architecture.md` 목차). 스키마 변경·새 모델·새 IPC는 없다.

- [x] 측정: 102분·71분을 20초 뒤 첫 쉼 / 25초 강제로 잘라 조각마다 whisper, 전체 정규화·조각별 정규화 — CER 19.12% → 18.64%(둘 다), 조각 처리 녹음 길이의 15% 안, GPU 합 1.8~1.9배 (`scripts/sttBench.ts --chunked`, `scripts/sttChunks.ts`, 2026-10-25)
- [x] 선행: 녹음 종류(메모) — 위 "녹음 기록 자동 정리"의 같은 항목 (2026-10-26 코드 완료, `pnpm dev` 확인 전)
- [ ] `audio/sttChunks.ts` 조각 나누기(순수 함수 + vitest: 20초 전 쉼은 넘김·20초 뒤 첫 쉼·25초 강제·꼬리) — `scripts/sttChunks.ts`의 규칙을 옮기고 스크립트가 그것을 쓰게 한다
- [ ] `audio/recordingStt.ts` 조각 인식(조각별 정규화·파이프라인 인자·시각 밀기·한 번에 하나·실패 시 멈춤) + 녹음 세션 연결(메모일 때만, 일시정지 청크 제외, 정지 때 꼬리 조각)
- [ ] `runPipeline`이 녹음 중 STT 결과를 받으면 정규화 파일·whisper를 건너뛰고 품질 지표만 원본에서 잰다. 결과가 없으면 파일 전체 경로
- [ ] 고품질 모델(`large-v3`)의 조각 시간 측정
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` 통과
- [ ] 완료 기준: `pnpm dev`에서 메모를 1분 넘게 녹음하고 정지하면 STT 대기 없이 몇 초 안에 기록이 끝나고, 같은 WAV를 "다시 인식"한 결과와 내용이 비슷하다. 녹음 중 whisper를 한 번 실패시키면(모델 경로를 잠깐 바꾸는 등) 정지 뒤 파일 전체 STT로 기록이 만들어진다
