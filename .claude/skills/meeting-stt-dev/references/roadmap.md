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
- [x] `scripts/pipeline.ts`: WAV → (VAD) → whisper JSON → diarization 출력 → `src/shared/merge.ts` → 회의록 텍스트 출력
- [x] `src/shared/merge.ts`·`format.ts`·`main/pipeline/{whisper,diarize}.ts` 단위 테스트 통과 (`pnpm test`, 45개)
- [x] 튜닝 결과 기록: 모델별(turbo-q5 / large-v3 / small) 처리 시간·체감 정확도, `cluster_threshold` 값, VAD 사용 유무 차이, 단어 타임스탬프 옵션 효과 → `docs/phase1-results.md`
- [x] 결론: 기본 모델·파라미터 확정 후 SKILL.md 결정 표 갱신 (실제 회의 WAV로 재확인 완료)

## Phase 2: 앱 골격 (관통)
- [ ] `src/shared/{types,ipc}.ts` 정의, preload에 타입 노출
- [ ] 녹음: AudioWorklet PCM 수집 → IPC 청크 전송 → main WAV append → 정지 시 헤더 확정
- [ ] macOS 마이크 권한 요청 및 거부 시 안내
- [ ] SQLite 초기화·마이그레이션, meetings/utterances/speakers 리포지토리
- [ ] 파이프라인 잡 큐(순차) + Phase 1 로직 이식(`normalize` → whisper/diarize → merge), 완료 시 `status='done'`, 실패 시 `'error'`
- [ ] 홈(리스트, 상태 표시) → 디테일(발화 리스트) 라우팅
- [ ] 완료 기준: 앱에서 녹음 → 정지 → 잠시 후 홈에서 회의록이 열린다

## Phase 3: 편집·복사·화자 관리
- [ ] 발화 인라인 편집 (blur 시 저장)
- [ ] 화자 라벨 클릭 → 이름 변경(전체 반영) / 다른 화자로 재배정 / 화자 병합
- [ ] 전체 복사(플레인/마크다운), 발화 단위 복사
- [ ] 처리 진행률 표시 (whisper `--print-progress` 파싱 → `pipeline:progress`)
- [ ] 회의 제목 변경, 삭제
- [ ] 원본 WAV 삭제/보관 설정

## Phase 4: 배포 품질
- [ ] 온보딩: 모델 선택(권장 turbo-q5 / 고품질 large-v3 / 저사양 small) → 다운로드(Range 이어받기, SHA256 검증, 진행률)
- [ ] "네트워크 사용은 모델 다운로드 한 번뿐" 문구 노출
- [ ] Windows x64 바이너리(CUDA/Vulkan/CPU 폴백) 배치 및 런타임 감지
- [ ] macOS Developer ID 서명 + notarization (동봉 바이너리 포함), Windows 코드 사이닝
- [ ] electron-updater 설정 (`publish` URL 교체)
- [ ] GitHub Actions: macOS/Windows 러너 분리 빌드
- [ ] 저사양 감지 시 small 모델 안내

## Phase 5: 확장 (별도 승인 후)
- [ ] llama.cpp 기반 로컬 요약 → `meetings.summary`
- [ ] 시스템 오디오 캡처 (Windows WASAPI loopback 우선, macOS ScreenCaptureKit 검토)
