# 배포 (Phase 4): 모델 다운로드·바이너리·서명·자동 업데이트

Phase 4에서 내린 결정의 SSOT. `SKILL.md`의 결정 표와 `references/architecture.md`(프로세스·IPC 규약)를 보완한다.
Phase 1~3에서 확정된 내용(모델 조합, 파이프라인, 편집 계약)은 여기서 다시 정의하지 않는다.

## 1. 모델 레지스트리 — 앱과 스크립트가 공유한다

`src/main/models/registry.ts`는 **electron을 import하지 않는 순수 데이터·함수**다. main 프로세스의 온보딩 다운로더와
`scripts/setupModels.ts`(Phase 1 픽스처용)가 같은 목록을 쓴다. 목록이 두 곳에 갈라지면 체크섬이 어긋난 채로 오래 남는다.

- 항목 형태: `{ key, label(한국어), fileName, url, sha256, sizeBytes, kind: 'direct' | 'archive' }`.
  `archive`는 아카이브 안에서 꺼낼 `entry` 경로를 함께 갖는다.
- **Whisper 모델만 사용자가 고른다** (`turbo-q5` 권장 / `large-v3-q5` 고품질 / `small-q5_1` 저사양).
  VAD·화자 분할·화자 임베딩은 선택지가 없는 필수 모델이다.
- 고른 모델은 `settings` 테이블의 `stt.model`(기본 `turbo-q5`)에 저장한다 (`references/data-model.md`).
  `src/main/models/paths.ts`는 이 값을 받아 whisper 모델 파일명을 정한다. 다른 모듈이 파일명을 직접 조립하지 않는다.
  `WhisperModelId`·`ModelKey` 타입은 도메인 타입이라 `src/shared/types.ts`에 있고, 레지스트리는 그것을 `import type`으로만 쓴다
  (타입 전용 import는 지워지므로 `scripts/`에서 레지스트리를 불러도 경로 별칭 해석이 필요 없다).
- **요약 모델은 온보딩에서 받지 않는다** (2026-08-26 결정). 필수 묶음(약 620MB)만 받아 첫 실행을 짧게 끝내고,
  2.4GB짜리 요약 모델은 `/settings`의 `SummaryModelSection`에서 사용자가 따로 받는다. 회의 상세의 `SummarySection`은
  요약 모델이 없으면 버튼을 막고 설정으로 가는 링크를 보여준다. "요약 버튼을 처음 누를 때 받기"는 택하지 않았다 —
  버튼 하나가 수 분짜리 다운로드와 수 분짜리 추론을 연달아 일으키면 사용자가 무엇을 기다리는지 알 수 없다.
- 파일은 전부 `userData/models/` 한 곳에 평평하게 둔다. 모델별 하위 폴더를 만들지 않는다 — 파일명이 이미 모델을 구분한다.

## 2. 온보딩 흐름

- 진입 조건: 필수 모델이 하나라도 없으면 앱 시작 시 `/onboarding`으로 보낸다. 전부 있으면 홈으로 간다.
- 화면 순서: 장비 사양으로 **권장 모델을 미리 골라 둔 상태**에서 선택지 3개를 보여 준다 → 받을 총 용량을 표시 →
  "다운로드" → 항목별 진행률 → 완료 시 홈으로 이동.
- **"네트워크는 여기서 한 번만 쓴다"** 는 문구를 이 화면에 노출한다 (`plan.md`의 로컬 우선 약속).
- **취소 버튼은 두지 않는다.** 이어받기(Range)가 되므로 창을 닫았다가 다시 들어오면 이어서 받는다.
  버튼을 두면 "취소 = 부분 파일 삭제"인지 "일시 정지"인지 사용자에게 설명해야 하는데, 이어받기가 있으면 그 구분이 의미가 없다.

## 3. 다운로드 IPC 계약 (Phase 4에 추가하는 채널)

```ts
models:   { status: 'models:status', download: 'models:download', downloadSummary: 'models:downloadSummary' }
events:   { modelDownload: 'models:downloadProgress' }
```

| 채널 | 요청 | 응답 |
| --- | --- | --- |
| `models:status` | 없음 | `ModelStatusResponse` |
| `models:download` | `{ whisperModelId }` | 완료 후 `ModelStatusResponse`. 고른 모델을 `settings.stt.model`에 저장하고 런타임 선택값도 바꾼다 |
| `models:downloadSummary` | 없음 | 완료 후 `ModelStatusResponse` (요약 모델만 받는다) |
| `models:downloadProgress` (push) | — | `{ key, receivedBytes, totalBytes, percent }` |

```ts
interface ModelStatusItem {
  key: ModelKey; label: string; isInstalled: boolean; sizeBytes: number
  /** false면 요약 모델. 온보딩 준비 여부(isReady)에 들어가지 않는다 */
  isRequired: boolean
}
interface WhisperModelChoice { id: WhisperModelId; label: string; description: string; sizeBytes: number }
interface ModelStatusResponse {
  isReady: boolean
  isSummaryReady: boolean
  selectedWhisperModelId: WhisperModelId
  recommendedWhisperModelId: WhisperModelId
  /** 선택 화면이 그릴 목록. 레지스트리는 main에만 있으므로 renderer는 이 응답으로만 안다 */
  whisperOptions: WhisperModelChoice[]
  items: ModelStatusItem[]
}
```

- `items`는 **현재 선택된** whisper 모델 + 필수 모델 3개 + 요약 모델이다. 다른 whisper 모델의 설치 여부는 싣지 않는다 —
  선택을 바꾸면 `models:download`가 그 모델을 받고, 이미 있으면 바로 끝난다.
- `models:download`는 **이미 설치된 모델을 고르기만 해도** 부른다(선택 저장이 이 채널의 몫이라서). 파일이 있으면 즉시 완료 이벤트만 보낸다.
- 다운로드 **동시성은 1**이다. 이미 받는 중에 새 요청이 오면 한국어 오류로 거절한다 (파이프라인 잡 큐와 같은 이유).
  `models:download`와 `models:downloadSummary`가 같은 잠금을 쓴다.
- 진행률은 `invoke`가 끝날 때까지 push로 온다. `invoke`는 마지막 파일까지 받고 나서야 resolve된다 — 수백 MB라 수 분이 걸리지만
  요약과 달리 사용자가 이 화면에서 기다리는 것이 전제이므로 잡 큐에 넣지 않는다.
- 검증은 SHA256. 불일치하면 파일을 지우고 "다시 시도해 주세요" 안내를 남긴다. 부분 파일은 남겨 두어야 이어받기가 된다.
- 아카이브(`.tar.bz2`, `.zip`)는 `tar -xf`로 푼다. macOS와 Windows 10 1803+에는 bsdtar가 기본 포함되어 있고,
  bsdtar는 확장자로 압축 방식을 자동 판별한다. `tar`가 없으면 "압축 해제 도구를 찾을 수 없습니다"로 실패시킨다 —
  bzip2 디코더를 의존성으로 들이지 않는다.

## 4. 저사양 감지

`src/main/models/recommend.ts`의 순수 함수로 두고 vitest로 검증한다 (electron·`os`를 import하지 않고 인자로 받는다).

```ts
recommendWhisperModelId({ cpuCount, totalMemoryBytes }): WhisperModelId
```

| 조건 | 권장 |
| --- | --- |
| 메모리 8GB 미만 **또는** 코어 4개 이하 | `small-q5_1` |
| 그 외 | `turbo-q5` |

- `large-v3-q5`는 자동으로 권장하지 않는다. Phase 1 측정에서 turbo 대비 **2.3배 느린데 품질 이득은 작았다**
  (`docs/phase1-results.md`). 사용자가 직접 고를 때만 쓴다.
- 권장값은 기본 선택일 뿐 강제하지 않는다. 저사양 장비에서 turbo를 고르면 "시간이 오래 걸릴 수 있다"고 안내만 한다.
  구체적으로: `recommendedWhisperModelId`가 `small-q5_1`(=저사양 판정)인데 다른 모델을 고르면 안내 문구를 붙인다.
  권장이 `turbo-q5`인 장비에서 `large-v3-q5`를 고르는 것은 사용자의 품질 선택이므로 안내하지 않는다 (설명문에 "2배 이상 느립니다"가 이미 있다).

## 5. 플랫폼별 바이너리

| 플랫폼 | 자산 | 비고 |
| --- | --- | --- |
| `darwin-arm64` (개발) | Homebrew `whisper-cli` 심볼릭 링크, sherpa-onnx `v1.13.6` osx-arm64 shared-no-tts | `pnpm tsx scripts/setupBin.ts` |
| `darwin-arm64` (배포) | whisper.cpp `v1.8.4`를 **소스에서 정적 빌드**, sherpa-onnx는 같음 | `pnpm tsx scripts/setupBin.ts --from-source` |
| `win32-x64` | whisper.cpp `whisper-blas-bin-x64.zip`(`b4938`), sherpa-onnx `v1.13.6` win-x64 shared-MD-Release-no-tts | `pnpm tsx scripts/setupBin.ts --platform=win32-x64` |

### macOS 배포용 whisper는 소스에서 빌드한다

Homebrew 설치본은 `@rpath`로 Cellar의 dylib(`libggml`, `libwhisper`)을 참조해서 **다른 컴퓨터에서 실행되지 않는다.**
그래서 배포 빌드는 `scripts/buildWhisper.ts`가 소스를 받아 직접 빌드한다.

- 버전은 **`v1.8.4` 고정** — Phase 1의 품질·타임스탬프 측정을 이 버전으로 했다 (`docs/phase1-results.md`).
  올리려면 `--vad`와 토큰 타임스탬프 동작(`references/pitfalls.md`)을 다시 확인한 뒤에 올린다.
- 옵션: `BUILD_SHARED_LIBS=OFF`(정적 링크) + `GGML_METAL_EMBED_LIBRARY=ON`(Metal 셰이더 내장).
  둘을 켜면 **파일 하나만 복사하면 되고**, `.metal` 파일을 따로 동봉할 필요가 없다.
- 빌드 후 `otool -L`로 시스템(`/usr/lib`, `/System`) 밖 라이브러리를 참조하는지 확인하고, 있으면 경고를 남긴다.
- 소스와 빌드 산출물은 `scripts/fixtures/build/`(git 제외)에 둔다. CMake가 그 안에 `compiler_depend.ts`라는
  **타임스탬프 파일**을 만들기 때문에 `tsconfig.node.json`·eslint·prettier에서 `scripts/fixtures`를 제외해야 한다.
  제외하지 않으면 `pnpm typecheck`가 CMake 산출물을 TypeScript로 파싱하려다 실패한다.

- **Windows용 Vulkan 빌드는 whisper.cpp 공식 릴리스에 없다.** 제공되는 것은 CPU(`whisper-bin-x64.zip`),
  CPU+OpenBLAS(`whisper-blas-bin-x64.zip`), cuBLAS 11.8/12.4(257MB/640MB)뿐이다.
  → **동봉은 CPU+BLAS 하나로 한다.** CUDA는 용량이 커서 설치 파일에 넣지 않고, 필요해지면 선택 다운로드로 따로 다룬다.
  로드맵의 "CUDA/Vulkan/CPU 폴백"은 이 사실에 맞춰 "CPU(BLAS) 동봉 + CUDA 선택"으로 좁힌다.
- **런타임 감지**: `src/main/bin/paths.ts`가 `win32-x64/cuda` → `win32-x64` 순으로 먼저 존재하는 폴더를 고른다.
  존재 여부만 보고 GPU를 조회하지 않는다 — 폴더를 채우는 주체(설치 파일·선택 다운로드)가 이미 판단했기 때문이다.
- 실행 파일 이름은 Windows에서 `.exe`가 붙는다. 확장자 처리도 `bin/paths.ts` 한 곳에서만 한다.
- Windows는 DLL이 **실행 파일과 같은 폴더**에 있어야 한다. sherpa-onnx는 아카이브의 `bin/`과 `lib/`에 흩어져 있으므로
  둘 다 같은 폴더로 복사한다 (macOS에서 dylib을 나란히 두는 것과 같은 이유).

## 6. 코드 사이닝 · notarization

- macOS: `hardenedRuntime: true` + `build/entitlements.mac.plist`(마이크·JIT 권한) + `notarize`.
  자격 증명은 커밋하지 않고 환경변수로 넘긴다 — `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- **공증은 옵트인이다.** `electron-builder.yml`의 기본값은 `notarize: false`이고,
  배포 빌드용 `pnpm run build:mac:release`가 `-c.mac.notarize=true`로 켠다.
  기본값을 켜 두면 자격 증명이 없는 로컬 빌드가 공증 단계에서 실패한다.
- **동봉 바이너리와 dylib도 서명 대상이다.** `asarUnpack`으로 풀려 나온 `resources/bin/**`이 서명되지 않으면
  하드닝 런타임에서 실행이 차단된다. 빌드 후 확인:
  `codesign --verify --deep --strict --verbose=2 <app>` / `spctl -a -t exec -vv <app>`.
- Windows: `win.signtoolOptions`(인증서 파일 + 암호)를 환경변수로 받는다. 인증서가 없으면 서명 없이 빌드한다.

## 7. 자동 업데이트 — 기본은 꺼 둔다

`electron-updater`를 넣되 **기본값은 꺼짐**이고, 설정의 `update.check`(기본 `false`)가 켜져 있을 때만 확인한다.

- 이유: 이 앱의 약속은 "네트워크는 모델 다운로드 한 번뿐"이다. 업데이터가 조용히 서버를 부르면 그 약속이 깨진다.
- `autoDownload = false`로 두고 **새 버전이 있다는 사실만 알린다.** 사용자가 받겠다고 해야 내려받는다.
- 개발 모드(`is.dev`)에서는 아무것도 하지 않는다.
- 업데이트 확인 실패는 로그만 남기고 무시한다. 오프라인이 정상 상태인 앱이다.
- 확인 시점은 **창이 뜬 직후 한 번**이다. 주기적으로 다시 확인하지 않는다.

### 업데이트 IPC 계약

```ts
update:  { download: 'update:download', install: 'update:install' }
events:  { updateAvailable: 'update:available' }
```

| 채널 | 요청 | 응답 |
| --- | --- | --- |
| `update:available` (push) | — | `{ version }` — 새 버전을 발견했을 때 한 번 |
| `update:download` | 없음 | 내려받기가 끝나면 resolve (`invoke`를 매달아 둔다 — 설치 파일 하나라 수십 초 안에 끝난다) |
| `update:install` | 없음 | 응답 없음. `quitAndInstall()`로 앱이 종료된다 |

- UI는 홈 상단의 `modules/features/update/UpdateBanner` 하나다. 이벤트를 받기 전에는 아무것도 그리지 않고,
  "받기" → 진행 중 → "다시 시작해 설치" 순서로 바뀐다. 무시하면 다음 실행 때 다시 알린다 (상태를 저장하지 않는다).
- 설정의 `update.check`는 `AppSettings.isUpdateCheckEnabled`로 노출하고 `/settings`의 체크박스로 켠다. 켜도 다음 실행부터 확인한다.

## 8. CI (GitHub Actions)

`.github/workflows/build.yml`

- macOS(`macos-15`, arm64)와 Windows(`windows-latest`) 러너를 분리한다. 크로스 빌드하지 않는다 —
  네이티브 애드온(`better-sqlite3`)과 동봉 바이너리가 플랫폼별로 다르기 때문이다.
- 순서: `pnpm install` → `pnpm tsx scripts/setupBin.ts` → `pnpm run build:mac` / `build:win`.
  `resources/bin/`이 비어 있으면 빌드를 중단한다 (`setupBin.ts`가 실패로 끝난다).
- push/PR에서는 아티팩트 업로드까지만 하고, `v*` 태그에서만 릴리스에 올린다.
- 서명 자격 증명은 저장소 시크릿으로 주입한다. 시크릿이 없는 포크 PR에서는 서명 없이 빌드가 지나가야 한다.

## 9. 단일 인스턴스

`app.requestSingleInstanceLock()`을 얻지 못하면 즉시 종료하고, 두 번째 실행 시도는 먼저 뜬 창을 앞으로 가져온다.
두 인스턴스가 같은 `userData/meetings.db`를 열면 나중에 뜬 쪽의 시작 정리가 먼저 뜬 쪽의 처리 중 회의를 `'error'`로 덮어쓴다
(`references/architecture.md` 잡 큐 절). 개발 모드도 예외가 아니다 — `pnpm dev`를 겹쳐 띄우면 두 번째가 바로 꺼진다.

## 10. 남은 작업 (2026-08-26 기준)

여기까지는 끝났고 실제로 확인했다 — 모델 레지스트리·다운로더(이어받기·SHA256·아카이브 해제),
Windows x64 바이너리 배치, macOS 배포용 whisper 정적 빌드(v1.8.4, Metal 내장), 저사양 권장 판단(+단위 테스트),
서명·공증 설정, `electron-updater` 코드, GitHub Actions 워크플로, `--dir` 패키징에서 동봉 바이너리가
`app.asar.unpacked/resources/bin/`로 풀리는 것, 그리고 Phase 3 머지 뒤의 배선(3절 IPC·preload·핸들러,
`useModelStatus`·`ModelDownloadSection`·`SummaryModelSection`·`pages/Onboarding`·`RequireModels` 가드,
`update.check` 설정·`UpdateBanner`, 단일 인스턴스 잠금)까지.

남은 것은 아래와 같다.

### 10.1 사용자만 할 수 있는 것

- **원격 저장소**: 아직 `git remote`가 없다. `electron-builder.yml`의 `publish.owner`가 `OWNER` 자리표시자다.
  첫 릴리스 전에 실제 저장소로 바꿔야 `electron-updater`가 동작한다.
- **서명 자격 증명**: Apple Developer ID 인증서와 `APPLE_ID`·`APPLE_APP_SPECIFIC_PASSWORD`·`APPLE_TEAM_ID`,
  Windows 코드 사이닝 인증서(`CSC_LINK`·`CSC_KEY_PASSWORD`)를 GitHub Secrets에 등록.
  그 뒤 `pnpm run build:mac:release`로 공증까지 돌려 보고 `codesign --verify --deep --strict` /
  `spctl -a -t exec`로 확인한다. 설정은 이미 되어 있고 자격 증명만 없다.
- **Windows 실기 검증**: 배치한 `win32-x64` 바이너리로 실제 파이프라인을 한 번 돌려 DLL 로딩과 경로를 확인해야 한다.
  macOS에서는 배치까지만 확인했다.

- **온보딩·설정 화면 실기 확인**: `userData/models/`를 비운 상태로 `pnpm dev`를 띄워 `/onboarding`으로 가는지,
  다운로드 진행률이 항목별로 올라가는지, 끝나면 홈으로 가는지. 개발 모드는 `scripts/fixtures/models/` 폴백이 있어
  픽스처 모델이 있으면 온보딩이 뜨지 않는다 (`references/architecture.md` 앱 런타임 경로 절).
- **업데이트 배너 실기 확인**: 릴리스가 있어야 확인할 수 있다. `publish.owner` 교체 → 태그 릴리스 → 이전 버전 설치본에서
  설정의 "업데이트 확인"을 켜고 재시작.

### 10.2 Windows용 llama.cpp 자산

`llama-b10622-bin-win-cpu-x64.zip`(18.1MB)을 쓴다. whisper와 같은 이유로 **CPU 빌드**를 고른다 —
릴리스에 Vulkan(34MB)·CUDA(250MB) 빌드도 있지만, GPU 빌드는 드라이버가 없으면 못 뜨고 설치 파일만 키운다.
요약은 사용자가 버튼으로 요청하는 기능이라 몇 분 더 걸리는 편이 낫다.

**꺼낼 파일은 PE 임포트 테이블로 확정했다** (Windows 실기 없이 확인 가능한 부분). 정적 의존 관계는 아래와 같다.

```
llama-cli.exe → llama-cli-impl.dll → { llama-common.dll, llama-server-impl.dll, llama.dll }
llama-server-impl.dll → { llama-common.dll, llama.dll, mtmd.dll, ggml.dll, ggml-base.dll }
llama.dll · llama-common.dll · mtmd.dll → { ggml.dll, ggml-base.dll }
ggml.dll → ggml-base.dll → libomp.dll
```

- 닫힘 집합 9개: `llama-cli.exe`, `llama-cli-impl.dll`, `llama-server-impl.dll`, `llama-common.dll`,
  `llama.dll`, `mtmd.dll`, `ggml.dll`, `ggml-base.dll`, `libomp.dll`(OpenMP 런타임).
- 여기에 **`ggml-cpu-*.dll` 14개**를 더한다. 정적 임포트가 아니라 ggml이 실행 시점에 CPU 명령어 집합을 보고
  하나를 고르는 백엔드라 임포트 테이블에 나오지 않는다 (whisper Windows 자산과 같은 이유로 전부 동봉한다).
- **`ggml-rpc.dll`은 넣지 않는다.** macOS는 `libllama.0.dylib`이 `libggml-rpc.0.dylib`을 직접 링크해서 필요했지만,
  Windows의 `llama.dll`은 임포트하지 않는다.
- 합계 약 42MB(압축 해제 기준). `llama-server`를 쓰지 않는데도 `llama-server-impl.dll`이 들어가는 이유는
  macOS와 같다 — `llama-cli-impl`이 직접 링크한다.

**남은 것은 Windows 실기 검증뿐이다.** DLL 로딩과 경로가 맞는지는 실제 Windows에서 `pnpm tsx scripts/setupBin.ts`
→ 요약 한 번으로 확인해야 한다 (10.1절의 Windows 실기 검증과 함께).
