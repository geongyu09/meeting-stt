# meeting-stt

서버 없이 로컬에서 동작하는 STT 회의록 데스크탑 앱.
마이크 녹음 → whisper.cpp(STT) → sherpa-onnx(화자 분리) → 병합 → SQLite 저장.

개발 방향성과 로드맵은 `plan.md` 및 `.claude/skills/meeting-stt-dev/`를 참고한다.

## 워크스페이스

pnpm 모노레포다. 아래 명령은 모두 저장소 루트에서 돌린다.

| 경로              | 패키지                | 무엇                                                                  |
| ----------------- | --------------------- | --------------------------------------------------------------------- |
| `apps/desktop`    | `meeting-stt`         | 제품 Electron 앱                                                      |
| `apps/web`        | `@meeting-stt/web`    | 브라우저 추론 프로토타입 (`docs/browser-prototype-plan.md`)           |
| `packages/core`   | `@meeting-stt/core`   | 두 앱 공용 순수 TS (타입·병합·포맷·정규화 공식·참석자 수·오디오 형식) |
| `packages/models` | `@meeting-stt/models` | 모델 카탈로그 (데스크탑 자산 / 웹 저장소 id)                          |

경계와 관리 규약은 `.claude/skills/meeting-stt-dev/references/monorepo.md`.

## 요구 사항

- Node.js 22 이상
- [pnpm](https://pnpm.io) 10 (패키지 매니저 / 스크립트 러너) — `corepack enable` 또는 `npm i -g pnpm`

## 설치

```bash
pnpm install
```

## 개발

```bash
pnpm dev            # 데스크탑 앱
pnpm dev:web        # 브라우저 프로토타입 (http://localhost:5180)
```

## 파이프라인 검증 (Phase 1, macOS arm64)

앱 UI 없이 STT·화자 분리 파이프라인만 스크립트로 돌려 본다.
바이너리와 모델은 용량이 커서 저장소에 없으므로 먼저 내려받는다.

검증 스크립트는 데스크탑 앱의 것이므로 그 워크스페이스에서 돌린다.

```bash
brew install whisper-cpp     # whisper-cli (Metal 빌드)
pnpm setup:bin               # apps/desktop/resources/bin/<platform>-<arch>/ 채우기
pnpm setup:models            # 모델 다운로드 (약 620MB, --all 이면 비교용 모델까지)

cd apps/desktop
pnpm exec tsx scripts/makeFixture.ts   # macOS say로 합성 한국어 회의 WAV 만들기
pnpm exec tsx scripts/pipeline.ts      # WAV → STT → 화자 분리 → 병합 → 회의록 텍스트
```

옵션은 `pnpm exec` 뒤에 그대로 붙인다. 루트에서 부를 때는 `pnpm --filter meeting-stt exec tsx scripts/pipeline.ts ...` 형태다.

```bash
pnpm --filter meeting-stt exec tsx scripts/pipeline.ts 회의.wav --speakers=3 --no-vad --dtw
```

측정 결과와 확정한 기본값은 `docs/phase1-results.md`에 있다.

## 테스트 / 검사

```bash
pnpm test        # 모든 워크스페이스 vitest (순수 로직 단위 테스트)
pnpm typecheck   # 모든 워크스페이스 tsc
pnpm lint        # 루트 eslint 하나가 저장소 전체
```

## 빌드

```bash
pnpm build:mac   # 데스크탑 앱 패키징 → apps/desktop/dist
pnpm build:web   # 브라우저 프로토타입 정적 빌드 → apps/web/dist
```
