---
name: meeting-stt-dev
description: 로컬 STT 회의록 데스크탑 앱(meeting-stt)의 개발 방향성·아키텍처 결정·단계별 로드맵·코딩 규칙. 이 프로젝트에서 기능 구현, 구조 설계, "다음 단계", 파이프라인(녹음→Whisper→화자분리→병합→SQLite), UI(홈/녹음/디테일), 모델 배포, 빌드/서명 관련 작업을 할 때 반드시 먼저 로드한다. 근거 문서는 plan.md.
---

# meeting-stt 개발 방향성

클로바 노트/젠스파크 회의록과 유사한 기능을 **서버 없이** 데스크탑 앱 하나로 구현한다.
근거 문서는 `plan.md`(2026-08 기준 조사 자료). 이 스킬은 그 문서에서 **결정된 사항**과
**작업 규칙**만 추려낸 것이며, 배경 설명이 필요하면 plan.md의 해당 섹션을 읽는다.

## 0. 문서 우선 원칙 (SSOT)

**이 스킬 문서(SKILL.md + `references/*.md`)가 프로젝트의 단일 진실 공급원(SSOT)이고, 코드는 그 부산물이다.**
코드와 문서가 다르면 문서가 옳다고 보고 코드를 문서에 맞춘다. 문서를 고쳐야 할 이유가 생겼다면 **코드보다 문서를 먼저 고친다.**

- 기술 결정(1절)·파이프라인(2절)·로드맵(3절)·구조 규칙(4절)과 어긋나는 구현·리팩터링·라이브러리 추가·모델 변경은
  **문서를 먼저 수정하고 사용자에게 변경 내용을 알린 뒤** 코드를 작성한다. "일단 코드 먼저, 문서는 나중에"는 금지.
- 작업 중 문서에 없는 결정을 내려야 하면(예: 새 IPC 채널 규약, 스키마 컬럼 추가, 상수 값 선택) 코드를 쓰기 전에
  해당 `references/*.md`에 결정과 근거를 추가한다. 사소한 구현 세부는 코드에 두되, 다른 코드가 의존하게 되는 계약은 문서에 둔다.
- Phase 완료·진입 등 상태 변화는 3절의 "현재 위치"와 `references/roadmap.md` 체크리스트를 갱신해 기록한다.
- 문서에 오래된 내용(예: 마이그레이션 전 도구 이름)이 발견되면 즉시 문서를 고친다. 낡은 문서는 잘못된 SSOT다.

## 1. 확정된 기술 결정 (변경 시 사용자 확인 필수)

| 영역 | 결정 | 비고 |
| --- | --- | --- |
| 데스크탑 프레임워크 | **Electron** (electron-vite + React 19 + TS) | 이미 스캐폴드됨. Tauri로 전환하지 않는다 |
| 패키지 매니저 / 스크립트 러너 | **pnpm 10** (`pnpm install`, `pnpm dev`, `pnpm test`, `pnpm tsx scripts/*.ts`) | 런타임은 **Node 22+**. 단위 테스트는 **vitest**, TS 스크립트 실행은 **tsx**. bun/npm/yarn 명령을 문서·스크립트에 섞지 않는다 |
| STT 엔진 | **whisper.cpp** `whisper-cli` 바이너리를 `child_process`로 spawn (방식 A) | 기본 모델 `ggml-large-v3-turbo-q5_0.bin`, 고품질 옵션 `large-v3-q5_0`, 저사양 옵션 `small-q5_1`. `-l ko --output-json-full` + 토큰 타임스탬프. **`-dtw`는 끔** (Phase 1에서 이득 없음, `--no-flash-attn`을 강제해 느려짐) |
| 화자 분리 | **sherpa-onnx** (pyannote segmentation-3.0 ONNX + 3D-Speaker ERes2Net 임베딩) | `sherpa-onnx-offline-speaker-diarization` CLI spawn (v1.13.6). 참석자 수를 모르면 `--clustering.cluster-threshold=0.6`(잠정), 알면 `--clustering.num-clusters` |
| VAD | **whisper.cpp 내장 VAD** (`--vad --vad-model ggml-silero-v5.1.2.bin`) | 환각 억제뿐 아니라 **타임스탬프 정확도에도 필수**. 끄면 화자 경계 단어가 앞 화자에게 붙는다 (`docs/phase1-results.md`) |
| 녹음 | `getUserMedia` + **AudioWorklet**으로 16kHz mono Float32 PCM 직접 수집 → WAV | MediaRecorder/ffmpeg 경로 사용 안 함. 주기적으로 디스크에 append |
| 저장소 | **SQLite** via `better-sqlite3` (main 프로세스 전용) | 스키마는 `references/data-model.md` |
| 라우팅 | React Router **메모리/해시 라우터** | URL 공유 없음 |
| 편집 | 발화 단위 인라인 편집(contentEditable/textarea, blur 시 UPDATE) | 에디터 라이브러리 도입 금지 (필요 생기면 그때 TipTap 검토) |
| 모델 배포 | 설치 파일에 미동봉, **첫 실행 온보딩에서 다운로드** (Range 이어받기 + 체크섬) | 저장 위치 `app.getPath('userData')/models` |
| 시스템 오디오 캡처 | **1차 범위 제외** (마이크만) | Phase 5 |
| 녹음본 재생 | 요구사항 아님 → 파이프라인 완료 후 원본 WAV **삭제가 기본**, 보관은 설정 옵션 | |

## 2. 처리 파이프라인 (불변)

```
[마이크 녹음 (AudioWorklet, 16kHz mono)]
  → [WAV 확정]
  → [VAD 무음 제거]
  → [whisper-cli → JSON 세그먼트(+단어 타임스탬프)]   ┐ 코어 수에 따라
  → [sherpa-onnx diarization → 화자 구간]              ┘ 병렬/순차 분기
  → [병합: 타임스탬프 겹침 최대 화자 배정 → 동일 화자 연속 발화 문단화]
  → [SQLite INSERT, status='done']
  → [(설정) 원본 WAV 삭제]
  → [홈 리스트 / 디테일 페이지: 조회·인라인 수정·화자 이름 지정·복사]
```

무거운 작업(spawn, 파일 IO, DB)은 전부 **main 프로세스(또는 utilityProcess)** 에서 수행하고,
renderer는 IPC로 요청·진행률 수신만 한다. 렌더러 내 추론(transformers.js/WebGPU)은 하지 않는다.

## 3. 단계별 로드맵 — 순서를 건너뛰지 않는다

상세 체크리스트(완료 기준 포함)는 `references/roadmap.md`.

1. **Phase 1 파이프라인 검증 (스크립트)** — 앱 UI를 만들기 **전에** `scripts/`에서 `pnpm tsx`로
   `whisper-cli → sherpa-onnx → 병합`을 실제 한국어 회의 WAV로 돌려 품질·속도를 확인하고
   모델 크기/양자화/`cluster_threshold`를 튜닝한다. 여기서 만든 병합 로직은 이후 `src/main/pipeline/`으로 그대로 옮긴다.
2. **Phase 2 앱 골격** — 녹음 → WAV → 파이프라인 → SQLite → 홈/디테일 관통.
3. **Phase 3 편집·복사·화자 관리** — 인라인 편집, 화자 이름, 전체/부분 복사, 진행률.
4. **Phase 4 배포 품질** — 온보딩 모델 다운로드, 코드 사이닝/notarization, electron-updater, 저사양 폴백.
5. **Phase 5 확장** — 로컬 LLM 요약(llama.cpp), 시스템 오디오 캡처.

현재 위치: **Phase 1 진행 중** (2026-08-26). 합성 픽스처로 파이프라인 배관 검증·파라미터 잠정 확정 완료 (`docs/phase1-results.md`). 남은 것은 **실제 한국어 회의 WAV로 품질 재측정**. 작업 시작 시 `git log`/디렉터리 상태로 현재 Phase를 먼저 재확인한다.

## 4. 코드 구조와 규칙

디렉터리 배치·IPC 규약·프로세스 경계는 `references/architecture.md`를 따른다. 코드 컨벤션·renderer React 레이어(추상화 레벨·콜로케이션·세그먼트·훅 위치)·IPC/API 작성·테스트 배치 규칙은 `.claude/rules/*.md`에 있으며, 해당 경로의 파일을 만들거나 수정할 때 자동으로 적용된다. 핵심 규칙:

- **프로세스 경계**: `src/main`(Node) / `src/preload`(contextBridge) / `src/renderer`(브라우저) / `src/shared`(순수 TS 타입·유틸, 런타임 의존 없음). 병합 알고리즘·포맷터 같은 순수 로직은 `src/shared` 또는 `src/main/pipeline`에 두고 `pnpm test`(vitest)로 단위 테스트한다.
- **IPC**: 채널 이름과 payload 타입은 `src/shared/ipc.ts`에 단일 정의. 요청-응답은 `ipcMain.handle`/`ipcRenderer.invoke`, 진행률 등 push는 `webContents.send`. preload는 `window.api`에 **타입이 붙은 함수만** 노출하고 `ipcRenderer`를 직접 노출하지 않는다.
- **외부 바이너리**: `resources/bin/<platform>-<arch>/` 에 두고 `asarUnpack` 대상으로 유지. 실행 전 존재·실행권한 확인, stdout JSON 파싱 실패/비정상 종료는 `status='error'`로 기록하고 사용자에게 안내한다.
- **데이터**: 화자 이름은 `utterances`에 쓰지 않고 `speakers(meeting_id, label) → display_name` 매핑으로 관리한다(한 번 바꾸면 전체 반영). 모든 시간 값은 초(sec, REAL), 생성 시각은 epoch ms.
- **한국어 우선**: 기본 언어 `ko`, UI 문구·문서·커밋 메시지는 한국어. 코드 식별자는 영어.
- **pnpm 주의**: pnpm 10은 의존성의 install/postinstall 스크립트를 기본 차단한다. 네이티브 애드온·바이너리 다운로드 패키지(`electron`, `esbuild`, `electron-winstaller`, `better-sqlite3`)는 `package.json`의 `pnpm.onlyBuiltDependencies`에 등록해야 한다. 새 네이티브 의존성을 추가하면 이 목록도 갱신한다. `.npmrc`의 `node-linker=hoisted`는 electron-builder 패키징을 위한 설정이므로 지우지 않는다. `package.json` scripts 내부 호출은 `pnpm run <script>`로 통일한다.
- **범위 절제**: plan.md에 없는 기능(클라우드 동기화, 실시간 스트리밍 STT, 계정 등)은 제안만 하고 구현하지 않는다.

## 5. 알려진 함정 (구현 전 확인)

전체 목록은 `references/pitfalls.md`. 자주 걸리는 것:

- Whisper는 무음에서 환각 텍스트를 만든다 → VAD 없이 추론 금지.
- Whisper 세그먼트 안에서 화자가 바뀔 수 있다 → 단어 단위 타임스탬프로 배정 후 재문장화.
- 장시간 녹음 PCM을 메모리에 전부 들고 있지 않는다 → 청크 단위 디스크 append.
- 저사양 CPU에서 STT+화자분리 병렬 실행은 오히려 느리다 → `os.cpus().length` 기준 분기.
- macOS 마이크 권한: `NSMicrophoneUsageDescription`(electron-builder.yml, 한국어 문구로 교체) + `systemPreferences.askForMediaAccess('microphone')`. Windows는 개인정보 설정 꺼짐 시 안내 UI.
- 동봉 바이너리도 macOS notarization 시 함께 서명해야 한다.

## 6. 작업 시작 시 절차

1. 이 스킬과 필요한 `references/*.md`를 읽는다. 결정 사항과 어긋나는 요청이면 plan.md 근거를 들어 한 번 확인하고, 사용자가 재확인하면 그대로 진행한다.
2. 현재 Phase와 완료 기준을 `references/roadmap.md`에서 확인하고, 해당 Phase 항목만 구현한다.
3. 순수 로직은 `pnpm test`로 검증, 앱 동작은 `pnpm dev`로 확인한 뒤 결과를 있는 그대로 보고한다.
4. 새로운 기술 결정(모델 변경, 라이브러리 추가, 규약 변경 등)이 생기면 **코드를 쓰기 전에** 이 SKILL.md의 결정 표나
   해당 `references/*.md`를 먼저 갱신한다(0절). 문서 갱신 → 사용자 확인 → 코드 순서를 지킨다.
