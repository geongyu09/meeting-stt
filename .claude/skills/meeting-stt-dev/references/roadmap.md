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
- [x] `scripts/pipeline.ts`: WAV → (VAD) → whisper JSON → diarization 출력 → `src/shared/merge.ts` → 회의록 텍스트 출력
- [x] `src/shared/merge.ts`·`format.ts`·`main/pipeline/{whisper,diarize}.ts` 단위 테스트 통과 (`pnpm test`, 45개)
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

- [x] 모델 레지스트리(`src/main/models/registry.ts`, 스크립트와 공유) + 다운로더(Range 이어받기, SHA256, `tar -xf` 아카이브 해제, 동시성 1)
- [x] 온보딩: 모델 선택(권장 turbo-q5 / 고품질 large-v3 / 저사양 small, 권장값 미리 선택) → 총 용량 → 항목별 진행률 → 완료 시 홈
      (`modules/widgets/model/ModelDownloadSection`, `pages/Onboarding`, `shared/routes/guards.tsx`의 `RequireModels` 가드)
- [x] "네트워크는 모델 다운로드 한 번뿐" 문구 노출 (온보딩·설정의 `ModelDownloadSection`)
- [x] 저사양 감지(`recommend.ts`, 단위 테스트) + 저사양 장비에서 다른 모델을 고르면 "시간이 오래 걸릴 수 있다" 안내
- [x] `/settings`에서 음성 인식 모델 변경(같은 위젯 재사용), 요약 모델 다운로드(`SummaryModelSection`), 업데이트 확인 옵션
- [x] macOS 배포용 whisper 정적 빌드(`scripts/buildWhisper.ts`, v1.8.4, Metal 내장), 서명·notarization 설정(옵트인)
- [x] electron-updater — 기본 꺼짐, `update.check` 설정으로 켬, 새 버전은 알리기만(`features/update/UpdateBanner`) → 사용자가 받기·설치
- [x] GitHub Actions: macOS(arm64) 검증 빌드만 (릴리스는 로컬 `pnpm run release:mac`, `references/distribution.md` 6·8절)
- [x] 단일 인스턴스 잠금(`app.requestSingleInstanceLock`)
- [x] 설정 '조용히 처리'(`pipeline.quiet`) — 화자 분리 스레드를 성능 코어의 절반으로, STT와 순차 실행 (`references/architecture.md` 가속·스레드 정책)
- [x] 통합 테스트: ModelDownloadSection, SummaryModelSection, UpdateBanner, SettingsSection(업데이트 옵션)
- [x] `electron-builder.yml`의 `publish.owner` 교체(`geongyu09`), 공증 자격 증명 등록(`notarytool` 키체인 프로필 `meeting-stt-notary`, 2026-09-18)
- [x] 첫 릴리스 `v0.1.0` 게시 (2026-09-18) — 공증·스테이플 확인, dmg만 업로드 성공. 다음 릴리스에는 자동 업데이트용 zip이 필요하다 (`references/distribution.md` 6절)
- [ ] 업데이트 배너 오탐 수정 — `checkForUpdates()`가 `isUpdateAvailable`을 보지 않아 v0.1.0 배포본이 자기 버전(0.1.0)을 새 버전으로 알리고,
      "받기"가 `Please check update first`로 실패한다 (2026-09-18 발견, `references/distribution.md` 7절 · `references/pitfalls.md`)
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
- [ ] 회의별 용어 사전(whisper `--prompt`) 검토 — STT 단계 과제. VAD로 잘린 구간마다 효과가 유지되는지와
      초기 프롬프트가 환각을 부르지 않는지 확인이 필요해 Phase 4 이후로 미룬다
- [x] **`pnpm dev`로 실제 앱에서 관통 확인** — 회의 상세에서 "요약 만들기" → 진행률 → 본문 표시 → 앱 재시작 후에도 남아 있는지
      (**2026-09-18 사용자 수동 확인 완료**)
- [ ] **동봉 dylib의 서명·공증 확인 — 자격 증명 대기.** rpath가 `@loader_path`인 것과 내려받은 상태가
      adhoc(linker-signed)인 것은 확인했다(`docs/phase5-results.md`). `asarUnpack: resources/**`도 걸려 있다.
      electron-builder가 Developer ID로 재서명한 결과 확인은 인증서가 있어야 가능하다 (`references/distribution.md` 6절)
- [ ] 저사양 폴백 모델 검토 (Qwen3-1.7B 등) — Phase 4 저사양 안내와 함께

### 5-2. 시스템 오디오 캡처

- [ ] 아직 시작하지 않음. macOS ScreenCaptureKit 검토 (plan.md 6.2절: 난이도가 높아 2차 과제 권장)
