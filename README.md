# meeting-stt

서버 없이 로컬에서 동작하는 STT 회의록 데스크탑 앱.
마이크 녹음 → whisper.cpp(STT) → sherpa-onnx(화자 분리) → 병합 → SQLite 저장.

개발 방향성과 로드맵은 `plan.md` 및 `.claude/skills/meeting-stt-dev/`를 참고한다.

## 요구 사항

- Node.js 22 이상
- [pnpm](https://pnpm.io) 10 (패키지 매니저 / 스크립트 러너) — `corepack enable` 또는 `npm i -g pnpm`

## 설치

```bash
pnpm install
```

## 개발

```bash
pnpm dev
```

## 파이프라인 검증 (Phase 1, macOS arm64)

앱 UI 없이 STT·화자 분리 파이프라인만 스크립트로 돌려 본다.
바이너리와 모델은 용량이 커서 저장소에 없으므로 먼저 내려받는다.

```bash
brew install whisper-cpp              # whisper-cli (Metal 빌드)
pnpm tsx scripts/setupBin.ts          # resources/bin/<platform>-<arch>/ 채우기
pnpm tsx scripts/setupModels.ts       # 모델 다운로드 (약 620MB, --all 이면 비교용 모델까지)
pnpm tsx scripts/makeFixture.ts       # macOS say로 합성 한국어 회의 WAV 만들기
pnpm tsx scripts/pipeline.ts          # WAV → STT → 화자 분리 → 병합 → 회의록 텍스트
```

옵션을 줄 때는 pnpm이 가로채지 않도록 `--` 를 먼저 붙인다.

```bash
pnpm tsx scripts/pipeline.ts -- 회의.wav --speakers=3 --no-vad --dtw
```

측정 결과와 확정한 기본값은 `docs/phase1-results.md`에 있다.

## 테스트 / 검사

```bash
pnpm test        # vitest (순수 로직 단위 테스트)
pnpm typecheck
pnpm lint
```

## 빌드

```bash
pnpm build:mac   # macOS
pnpm build:win   # Windows
```
