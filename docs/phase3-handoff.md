# 인계 메모 (최종 갱신 2026-09-18, Phase 1~4·5-1 종료 시점)

Phase 3(편집·복사·화자 관리), Phase 4(온보딩 모델 다운로드·업데이터·단일 인스턴스), Phase 5-1(로컬 요약)의 코드가 모두 붙은 시점에
**남은 일**만 적어 둔 문서다. Phase별 완료 기준 자체는 `.claude/skills/meeting-stt-dev/references/roadmap.md`가 SSOT이고,
이 문서는 작업 상태와 인계 사항만 담는다. 전부 처리되면 지운다.

**2026-09-18: 각 Phase의 완료 기준은 모두 통과했다.** 아래 남은 항목은 완료 기준이 아니라 곁가지 확인들이라,
이것들만 정리되면 이 문서는 지우고 4절 내용만 `references/architecture.md`로 옮기면 된다.

자동 검증 상태: `pnpm test` 171개 통과, `pnpm typecheck`·`pnpm lint`·`pnpm exec prettier --check .`·`electron-vite build` 통과,
`pnpm dev` 기동 시 main 로그에 오류 없음.

## 1. 수동 확인 (자동 검증 불가)

`pnpm dev`로 확인해야 하는 항목. 마이크 권한·실제 발화·실제 회의록 데이터·빈 `userData`가 필요해 테스트로 대체할 수 없다.

- [x] **Phase 2 완료 기준**: 녹음 → 정지 → 잠시 후 홈에서 회의록이 열리는가 (2026-09-18 확인 완료)
- [x] **Phase 3 완료 기준**: 회의록에서 발화 텍스트 / 화자 이름 / 회의 제목을 고치고 복사한 결과가 앱을 다시 켜도 그대로 남는가 (2026-09-18 확인 완료)
- [ ] `/settings`의 "원본 녹음 파일 보관"을 켠 상태와 끈 상태로 각각 파이프라인을 돌려
      `userData/recordings/<meetingId>.wav` 삭제 정책이 의도대로 도는가 (기본은 삭제, 실패한 잡은 보존)
- [x] **Phase 4 완료 기준**: `scripts/fixtures/models/`를 잠시 옮기고(개발 모드 폴백 때문) `userData/models/`가 빈 상태로 켜면
      `/onboarding`이 뜨는가 → 다운로드 진행률이 항목별로 올라가는가 → 끝나면 홈으로 가는가 (2026-09-18 확인 완료)
      · `/settings`에서 음성 인식 모델을 **바꿔 받는** 경로는 아직 안 돌려 봤다 (`ggml-small-q5_1.bin`이 `userData/models/`에 없다)
- [x] **Phase 5-1 완료 기준**: 회의 상세에서 "요약 만들기" → 진행률 → 본문 표시 → 앱 재시작 후에도 남아 있는가 (2026-09-18 확인 완료)
      · 요약 모델이 **없을 때** 설정 링크가 뜨는 경로는 안 돌려 봤다 (모델이 이미 받아져 있어 재현하려면 치워야 한다)
- [ ] 두 번째 `pnpm dev`(또는 패키징 앱 두 번 실행)가 바로 꺼지고 먼저 뜬 창이 앞으로 오는가

## 2. 사용자만 할 수 있는 것 (`references/distribution.md` 10절)

- [x] 원격 저장소 만들고 `electron-builder.yml`의 `publish.owner` 교체 (`geongyu09`, 2026-09-18)
- [x] Apple Developer ID 자격 증명 등록 후 공증까지 확인 — `notarytool` 키체인 프로필(`meeting-stt-notary`)로
      v0.1.0을 공증·스테이플해 게시했다 (2026-09-18). 릴리스는 GitHub Secrets/CI가 아니라 **로컬**에서 만든다
      (`references/distribution.md` 6·8절)
- [x] 동봉 바이너리가 Developer ID로 함께 재서명됐는지 확인 — **v0.1.0 dmg로 2026-09-18 확인 완료.**
      `resources/bin/darwin-arm64/`의 17개(dylib 14 + 실행 파일 3) 전부 `Developer ID Application: geongyu Park (3XD9F9256D)`,
      하드닝 런타임(`flags=0x10000(runtime)`)·타임스탬프 포함, `codesign --verify --strict` 실패 0건.
      앱 자체는 `spctl` `source=Notarized Developer ID` + `stapler validate` 통과 (`references/distribution.md` 6절)
- [ ] 업데이트 배너 실기 확인 — **v0.1.0만 있어서 아직 못 한다.** 다음 릴리스(zip 포함)가 올라가야 0.1.0에서 배너가 뜬다

~~Windows 실기 확인·`LLAMA_ENTRIES` 추가~~ — macOS 전용 결정(2026-08-26, `SKILL.md` 결정 표)으로 무효.

## 3. 커밋 정리 — 끝남

Phase 2 마무리·3·4·5-1 변경분은 모두 커밋됐다 (2026-09-18 기준 `main`).

## 4. 알아 둘 것 (다음 작업자용)

- 회의 상세를 바꾸는 IPC는 모두 갱신된 `MeetingDetail`을 돌려준다. renderer는 `useMeeting`이 그 응답을 상태에 그대로 덮어쓴다
- 복사는 main의 `electron.clipboard`를 거친다 (`clipboard:writeText`). 되돌릴 수 없는 동작은 2단계 인라인 확인이다
- 모델 선택(`stt.model`)은 `AppSettings`가 아니라 `models:download`가 저장한다 — 바꾸는 행위가 다운로드를 동반하기 때문 (`references/data-model.md`)
- 요약 모델은 온보딩 묶음에 없다. `/settings`의 `SummaryModelSection`에서 따로 받는다 (`references/distribution.md` 1절)
- 업데이트 확인은 기본 꺼짐이고 `update.check`를 켠 사용자만 창이 뜬 직후 한 번 확인한다. 배너는 알리기만 하고 받기·설치는 사용자가 누른다
- 재사용 가능한 것: `InlineEditableText`, `ProgressBar`, `PipelineProgress`, `ModelDownloadSection`(온보딩·설정 공용), `shared/utils/formatBytes`
