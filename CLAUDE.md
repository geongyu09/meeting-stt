# meeting-stt

서버 없이 로컬에서 동작하는 STT 회의록 데스크탑 앱 (Electron + whisper.cpp + sherpa-onnx).
개발 방향성·아키텍처·로드맵은 `.claude/skills/meeting-stt-dev/SKILL.md`를 **먼저 로드**한다. 근거 문서는 `plan.md`.

**SSOT 규칙**: 개발 방향·아키텍처·기술 결정의 단일 진실 공급원은 **스킬 문서**(`SKILL.md` + `references/*.md`)이고 코드는 그 부산물이다.
기존 방향과 다른 구현·결정이 필요해지면 **무조건 문서를 먼저 수정**하고 사용자에게 알린 뒤 코드를 작성한다. 코드와 문서가 다르면 문서가 옳다.

## 도구 체인

- 패키지 매니저 / 스크립트 러너: **pnpm 10** (`packageManager` 필드 고정). bun / npm / yarn 명령은 쓰지 않는다.
- 런타임: Node 22+. Electron main/preload는 Node에서 실행된다.
- 단위 테스트: **vitest** (`pnpm test`), TS 스크립트 실행: **tsx** (`pnpm tsx scripts/<name>.ts`).

## 자주 쓰는 명령

```bash
pnpm install        # 의존성 설치 (postinstall에서 electron-builder install-app-deps 실행)
pnpm dev            # 개발 모드 (electron-vite dev)
pnpm test           # vitest run
pnpm typecheck      # tsc (node + web)
pnpm lint           # eslint
pnpm build:mac      # macOS 패키징
pnpm build:win      # Windows 패키징
```

## pnpm 관련 규칙

- pnpm 10은 의존성의 install/postinstall 스크립트를 기본 차단한다. 네이티브 애드온이나 바이너리를 내려받는 패키지(`electron`, `esbuild`, `electron-winstaller`, `better-sqlite3` 등)를 추가하면 `package.json`의 `pnpm.onlyBuiltDependencies`에 반드시 등록한다. `pnpm install` 로그에 "Ignored build scripts" 경고가 보이면 누락된 것이다.
- `.npmrc`의 `node-linker=hoisted`, `shamefully-hoist=true`는 electron-builder 패키징과 네이티브 리빌드를 위한 설정이므로 제거하지 않는다.
- `package.json` scripts 내부에서 다른 스크립트를 부를 때는 `pnpm run <script>`를 쓴다.
- 잠금 파일은 `pnpm-lock.yaml` 하나만 유지한다 (`bun.lock`, `package-lock.json`, `yarn.lock` 생성 금지).

## 코드 규칙 (요약)

- `src/main`(Node) / `src/preload`(contextBridge) / `src/renderer`(브라우저) / `src/shared`(순수 TS) 경계를 지킨다. renderer에서 `fs`, `child_process`, `better-sqlite3` import 금지.
- 무거운 작업(spawn, 파일 IO, DB)은 main 프로세스에서만. renderer는 IPC로 요청·진행률 수신만.
- UI 문구·문서·커밋 메시지는 한국어, 코드 식별자는 영어.
