# 기능 설계: 화면

`references/architecture.md`에서 나눈 기능별 설계다. 프로세스 경계·디렉터리·IPC 규약 같은 공통 구조는 `references/architecture.md`에 있고,
다른 기능 문서의 절 이름은 그 문서의 "기능별 설계 문서" 목차에서 찾는다. 아래 `src/…`, `scripts/…`, `resources/…`는 모두 `apps/desktop/` 기준이다.

## UI 언어 (2026-09-25)

사용자 요청으로 설정에 **UI 언어** 항목을 둔다. 기본은 한국어이고 영어를 고를 수 있다. 이 설정은 **화면 문구·메뉴바·main이 renderer로 보내는 오류 문구**의 언어이지,
인식·요약 언어가 아니다 — whisper의 `-l ko`, 요약·용어 초안 프롬프트, 교정의 한글 읽기 판정은 어느 언어를 골라도 한국어 회의를 전제로 그대로 돈다.
문서·커밋 메시지·코드 주석도 계속 한국어다.

### 사전과 타입

- 문구는 **`src/shared/locales/<domain>.ts`** 에 도메인별로 둔다. 한 파일이 `ko`와 `en`을 **나란히** export하고, `ko`가 타입을 정의하며 `en`은 `typeof ko`로 묶인다.
  한쪽 언어에만 키를 추가하면 타입 오류가 난다 — 번역 누락을 컴파일로 잡는다. 두 언어를 한 파일에 두는 이유는 문구를 고칠 때 대응하는 번역이 바로 옆에 보여야 하기 때문이다.
- 값이 들어가는 문구는 문자열 템플릿이 아니라 **함수**다 (`deletedCount: ({ count }) => `${count}개 삭제됨``). 어순이 언어마다 달라 `{count}` 치환 규약을 따로 만들지 않는다.
- 도메인 파일: `common`(버튼·공통 오류), `sidebar`(회의 목록·검색·날짜 묶음), `transcript`(회의록·화자·하단 녹음 바), `summary`, `refine`, `pipeline`(단계 라벨), `recording`(녹음 화면·위젯 패널), `models`(모델 다운로드), `setup`(처음 실행 설정 카드), `settings`(설정 카테고리·토글·단축키), `llm`, `glossary`, `update`, `main`(메뉴바·main 프로세스 오류).
  `src/shared/i18n.ts`가 이들을 `MESSAGES: Record<Locale, Messages>`로 모으고 `Locale`(`'ko' | 'en'`)·`DEFAULT_LOCALE`·`isLocale`을 정의한다.
- 사전 파일은 데이터라 **400줄 제한의 예외**다. 대신 도메인이 커지면 파일을 나눈다.
- i18n 라이브러리(i18next 등)는 도입하지 않는다 — 두 언어·수백 문구에 키 문자열 조회·복수형 규칙·지연 로드가 필요 없고, 타입으로 누락을 잡는 쪽이 낫다.

### renderer

- 전역 컨텍스트 `shared/provider/context/localeContext`(`.claude/rules/project-structure.md` "Context / Provider / Routes")가 `LocaleProvider`·`useLocale`을 한 파일에 둔다.
  `useLocale()`은 `{ locale, t }`를 돌려주고 `t`는 그 언어의 `Messages`다. 컴포넌트는 `t.settings.title`처럼 읽는다.
- 컨텍스트 기본값은 한국어 사전이다. 그래서 통합 테스트는 Provider 없이도 한국어 문구를 그대로 검증한다.
- Provider는 마운트 시 `settings:get`으로 언어를 읽고, 이후에는 push 채널 **`settings:changed`** 를 구독한다. 위젯 창은 메인 창과 다른 창이라 설정 화면이 바꾼 값을 push로만 알 수 있다.
  Provider는 `document.documentElement.lang`도 함께 맞춘다 (`index.html`의 기본은 `ko`).
- 날짜·경과 시간 포맷터(`shared/utils/formatMeetingDate`, `meetingDateGroup`, `formatDuration`)는 `locale`을 인자로 받는다. "오늘"·"어제" 같은 묶음 라벨은 사전에서 읽는다.

### main

- `src/main/locale.ts`의 `t()`가 현재 언어의 사전을 돌려준다. 이 모듈은 DB를 읽지 않는다 — 앱 시작 시 `setCurrentLocale(getAppSettings().locale)`로 넣고
  `settings:update` 핸들러가 바꾼다. 순수 로직(파이프라인·업데이트 결과 해석)이 오류 문구 하나 때문에 DB·electron에 묶이면 단위 테스트가 깨지기 때문이다. 메뉴바 메뉴·저장 대화상자·**renderer가 그대로 보여 주는 오류 메시지**(`throw new Error(...)`)는 던지는 시점에 이 사전으로 만든다.
  파이프라인 오류처럼 DB(`meetings.error_message`)에 남는 문구는 그 시점 언어로 저장되고 언어를 바꿔도 다시 번역하지 않는다 — 오류는 재시도하면 새로 쓰인다.
- `settings:update`가 언어를 바꾸면 main은 메뉴바 메뉴를 다시 만들고(`refreshTray`) 모든 창에 `settings:changed`를 push한다.
- 운영 로그(`src/main/log.ts`)와 LLM 프롬프트는 번역하지 않는다.

### 범위 밖

- `apps/web` 브라우저 프로토타입은 한국어만 유지한다.
- macOS 시스템 대화상자 문구(`NSMicrophoneUsageDescription`)는 `electron-builder.yml`의 한국어 하나다. 영어 `InfoPlist.strings`는 후속 과제다.

## 피드백 보내기 (2026-09-28)

사용자 요청으로 설정 화면에서 피드백을 보낼 수 있게 한다. **서버를 두지 않고 사용자 정보도 모으지 않는다** (사용자 결정) —
앱은 아무것도 전송하지 않고, 공개 저장소 `github.com/geongyu09/meeting-stt`의 **이슈 작성 화면을 내용을 미리 채워 기본 브라우저로 열기만** 한다.
제출은 사용자가 브라우저에서 직접 한다. 메일(`mailto:`)·Google Forms 경로는 두지 않는다 (사용자 결정, GitHub 이슈 하나).

- **이슈 폼**: `.github/ISSUE_TEMPLATE/feedback.yml`. 필드 id는 `kind`(버그/제안/기타)·`description`·`app-version`·`os`이고,
  앱이 여는 URL은 `/issues/new?template=feedback.yml&app-version=<app.getVersion()>&os=macOS <process.getSystemVersion()> (<process.arch>)`다.
  GitHub 이슈 폼은 쿼리 파라미터 이름이 필드 id와 같으면 그 값을 채운다. 필드 id를 바꾸면 이 URL도 같이 바꾼다.
- **미리 채우는 값은 앱 버전·macOS 버전·아키텍처뿐이다.** 회의 내용·전사·파일 경로·설정값·로그는 넣지 않는다. 사용자는 제출 전에 브라우저에서 이 값을 보고 지울 수 있다.
  본문 입력은 앱이 아니라 GitHub 폼에서 받는다 — 앱에 입력창을 두면 URL 길이 제한(약 8KB)을 신경 써야 하고, 같은 내용을 두 번 확인하게 된다.
- 이슈는 **공개**된다. 설정 화면 설명과 이슈 폼 양쪽에 "회의 내용을 붙여 넣지 말라"고 적는다.
- **IPC** `feedback:open`(invoke, payload 없음). renderer는 URL을 만들지 않는다 — 버전·OS는 main만 알고, renderer가 임의 URL을 열게 하는 채널을 만들지 않기 위해서다.
  URL 조립은 순수 함수 `src/main/feedbackUrl.ts`(`buildFeedbackIssueUrl`, vitest), 열기는 아래 외부 링크 규칙을 거친다.
- **외부 링크는 `https:`만 연다.** `src/main/windows/externalUrl.ts`의 `isAllowedExternalUrl`(vitest)이 스킴을 검사하고,
  메인 창의 `setWindowOpenHandler`와 `feedback:open`이 같은 `openExternalUrl`을 거친다. 허용하지 않는 스킴은 열지 않고 경고 로그를 남긴다.
  (품질 점검 후속 "창 보안" 항목의 스킴 검사 부분. `will-navigate` 차단·위젯 창·`sandbox`는 그 항목에 남는다.)
- **화면**: 설정의 마지막 카테고리 "피드백"에 행 하나 — 설명 + `GitHub에서 작성` 버튼(`modules/features/feedback/FeedbackButton`). 열기에 실패하면 행 아래에 오류 문구.

## 화면 디자인 (UI 리디자인, 2026-09-24)

사용자와 Design 캔버스 시안("여백")으로 확정했다. 시안은 참고 자료이고, 값·구조의 근거는 이 절이다.

### 디자인 토큰 (`packages/design/src/base.css`)

색·간격·반경·글꼴은 `:root` CSS 변수로만 쓴다 (`.claude/rules/general-code-convention.md`). 기존 변수 이름은 유지하고 값만 바꾸며, 모자란 것만 추가한다.

**토큰과 글꼴은 `@meeting-stt/design` 패키지가 단일 정의다** (2026-09-24, `references/monorepo.md` "디자인 패키지"). 브라우저 프로토타입(`apps/web`)도 같은 토큰·글꼴을 import한다.
데스크탑 전용 레이아웃 치수(`--sidebar-width` 272px, `--topbar-height` 52px, `--rail-width` 300px)는 `assets/layout.css`에 둔다. `--rail-width`는 기본값이고, 회의 상세에서 사용자가 끌어 바꾼 폭이 인라인 변수로 덮어쓴다 ("화면별 구성").

| 변수 | 값 | 용도 |
| --- | --- | --- |
| `--color-bg` | `#FFFFFF` | 본문 바탕 |
| `--color-sidebar` (추가) | `#F7F7F8` | 사이드바, 선택·hover 행, 스테퍼 버튼 |
| `--color-surface` | `#FFFFFF` | 카드·입력 |
| `--color-surface-hover` | `#F7F7F8` | hover |
| `--color-border` | `#E7E7EA` | 선 |
| `--color-border-strong` (추가) | `#DCDCE0` | 버튼·입력 테두리 |
| `--color-divider` (추가) | `#EDEDF0` | 설정 행 구분선, 상단 바 밑줄 |
| `--color-disabled` (추가) | `#D4D4D9` | 꺼진 스위치, 비활성 버튼, 레벨 미터 빈 칸 |
| `--color-text` | `#111113` | 본문 글자, 주요 버튼 바탕 |
| `--color-text-muted` | `#6B6B73` | 보조 글자 (흰 바탕 대비 5.3:1) |
| `--color-text-inverse` (추가) | `#FFFFFF` | 주요·강조 버튼 글자. 기존 `--color-accent-text`는 같은 값으로 남긴다 |
| `--color-accent` | `#4338CA` | 새 녹음·녹음 중 표시·포커스·편집 테두리 (흰 글자 대비 7.9:1) |
| `--color-accent-soft` (추가) | `#E0E7FF` | 녹음 중 점 둘레 |
| `--color-danger` | `#B4232A` | 오류 글자·회의 삭제. **빨강은 오류 전용**이고 녹음에 쓰지 않는다 |
| `--color-danger-soft` (추가) | `#FDECEC` | 오류 배지·삭제 버튼 바탕 |
| `--color-success` | `#15803D` | 완료 체크 |
| `--color-speaker-1`~`8` (추가) | `#0F766E` `#C2410C` `#BE185D` `#854D0E` `#1D4ED8` `#7E22CE` `#4D7C0F` `#475569` | 화자 점·이름. 9번째 화자부터 1번부터 다시 돈다. 모두 흰 바탕 대비 4.5:1 이상이고 오류 빨강(`--color-danger`)과 겹치지 않는다 |
| `--font-sans` (추가) | `'Google Sans', 'Pretendard', -apple-system, sans-serif` | 전체 |
| `--font-mono` (추가) | `'Google Sans Code', 'Google Sans', monospace` + `font-variant-numeric: tabular-nums` | 타이머·타임스탬프·퍼센트·단축키 |

| `--color-thumb` (추가, 2026-09-28) | `#FFFFFF` | 꺼진 스위치 손잡이. 켜진 손잡이는 `--color-text-inverse` |
| `--color-disabled-text` (추가, 2026-09-28) | `#FFFFFF` | 비활성 버튼 글자 |
| `--color-success-soft` (추가, 2026-09-28) | `#E7F4EC` | 완료 표시 바탕 (브라우저 프로토타입 처리 단계) |

- 다크 모드는 아래 "다크 모드" 절을 따른다. 새 토큰을 추가하면 다크 값도 같은 커밋에 넣는다 — 반쪽짜리 다크 토큰은 새 화면을 다크에서 깨뜨린다.
- 간격 4·8·12·16·24·32는 기존 `--space-1`~`6`을 그대로 쓴다. 반경은 `--radius-sm` 6 · `--radius-md` 10 · `--radius-lg` 12(추가) · `--radius-full`이다.
  시안의 8px 반경은 토큰을 따로 두지 않고 `--radius-sm`으로 맞춘다 (2px 차이로 단계를 하나 늘릴 이유가 없다).
- 포커스 표시는 모든 컨트롤이 `:focus-visible`에 `2px solid var(--color-accent)` 외곽선 + 2px 간격으로 통일한다.

### 다크 모드 (2026-09-28)

2026-09-28 사용자 요청으로 Design 캔버스 "meeting-stt 다크 모드" 시안(다크 토큰·회의 상세·녹음 중)을 근거로 넣었다. 2026-09-24의 "다크 모드 보류"를 대체한다.

- `base.css`의 `@media (prefers-color-scheme: dark)` 블록이 `:root` 변수 값만 바꾸고 `color-scheme: light dark`로 스크롤바·폼 컨트롤도 맞춘다.
- **테마 설정** (2026-09-28 사용자 요청): 설정 "화면" 카테고리에서 `system`(시스템 설정 따르기, 기본) · `light` · `dark` 중 고른다 (`AppSettings.theme`, `src/shared/theme.ts`, DB 키 `ui.theme`).
  main이 앱 시작 시 창을 만들기 **전에**, 그리고 `settings:update`에서 값이 바뀔 때 `nativeTheme.themeSource`에 그대로 넣는다.
  그러면 Chromium이 모든 창의 `prefers-color-scheme`을 바꾸고 위젯 패널의 vibrancy 재질도 같은 외형을 따른다 — renderer는 테마를 따로 알 필요가 없고 `data-theme` 같은 속성도 두지 않는다.
  `system`이면 macOS 외형이 바뀔 때 앱도 즉시 따라간다. 창 생성 전에 적용하므로 재시작해도 첫 화면부터 저장된 테마로 뜬다.
- 변수 이름은 그대로, 값만 바꾼다. 컴포넌트 CSS는 토큰만 쓰므로 수정하지 않는다. 면은 잉크 계열 차가운 무채색으로 층을 쌓고(바탕 < 사이드바 < 카드 < hover), 강조 인디고는 밝혀 글자·버튼 모두 4.5:1을 넘긴다.
  **강조·주요 버튼 글자는 `--color-text-inverse`가 어두운 잉크로 뒤집힌다.** 빨강은 여전히 오류 전용이다.
- 위젯 패널은 `vibrancy: 'popover'`라 시스템 외형을 따라 재질이 바뀌고, 글자는 같은 토큰으로 따라간다.

| 변수 | 다크 값 | 비고 |
| --- | --- | --- |
| `--color-bg` | `#121214` | 본문 바탕 |
| `--color-sidebar` | `#18181B` | 사이드바 · 선택 행 |
| `--color-surface` | `#1C1C20` | 카드 · 입력 (한 단 떠오름) |
| `--color-surface-hover` | `#232328` | hover · 중립 배지 |
| `--color-border` | `#2A2A30` | 카드 선 |
| `--color-border-strong` | `#3A3A41` | 버튼 · 입력 테두리 |
| `--color-divider` | `#222226` | 행 구분 · 상단 바 밑줄 |
| `--color-disabled` | `#45454C` | 꺼진 스위치 · 빈 레벨 칸 |
| `--color-text` | `#ECECEF` | 본문 · 주요 버튼 바탕 (15.9:1) |
| `--color-text-muted` | `#9B9BA5` | 보조 글자 (6.8:1) |
| `--color-text-inverse` | `#111113` | 주요·강조 버튼 글자, 켜진 스위치 손잡이 |
| `--color-accent` | `#8B8FF7` | 새 녹음 · 포커스 · 녹음 표시 (6.6:1) |
| `--color-accent-text` | `#111113` | 강조 위 글자 |
| `--color-accent-soft` | `#26264A` | 녹음 점 둘레 · 검색 `mark` |
| `--color-danger` | `#F47A74` | 오류 전용 (7.0:1) |
| `--color-danger-soft` | `#3A1C1D` | 오류 배지 · 삭제 바탕 |
| `--color-success` | `#4CC97A` | 완료 체크 (8.9:1) |
| `--color-success-soft` | `#173323` | 완료 표시 바탕 (시안 밖, 같은 규칙으로 정함) |
| `--color-thumb` | `#ECECEF` | 꺼진 스위치 손잡이 |
| `--color-disabled-text` | `#8A8A93` | 비활성 버튼 글자 |
| `--color-speaker-1`~`8` | `#2DC4B0` `#F08A4B` `#F06AA8` `#D2A23A` `#6AA3F8` `#B98AF5` `#8CC43A` `#98A3B3` | 라이트와 같은 색상환 순서, 명도만 올림. 모두 바탕·면 대비 5.9:1 이상 |

### 공통 컴포넌트 (`shared/components/primitives/ui`)

도메인 로직 없이 UI만 다룬다. 색은 위 토큰만 쓴다.
**이 표가 두 앱의 계약이다.** 패키지는 `react`를 import하지 않으므로 브라우저 프로토타입은 같은 계약을 `apps/web/src/components/*`에 따로 구현한다 (`Button`·`Badge`·`Icon`·`Switch`·`Stepper`·`ProgressBar`·`LevelWaveform`). 계약을 바꾸면 두 구현을 같이 고친다. 아래 레이아웃 컴포넌트는 데스크탑 창 구조 전용이라 웹에 두지 않는다.

| 컴포넌트 | 계약 |
| --- | --- |
| `Button` | `variant`: `accent`(강조 바탕 — 새 녹음·녹음 시작, 화면당 하나) · `primary`(잉크 바탕, **기본값** — 화면의 주 동작) · `secondary`(흰 바탕 + `--color-border-strong` 테두리) · `danger`(`--color-danger-soft` 바탕 + 빨간 글자 — 삭제 확인에만). `size`: `md`(기본, 34px) · `sm`(상단 바·행 안, 30px). 모양은 **알약형**(`--radius-full`, 2026-10-22 리뉴얼 시안 — 모든 보드의 버튼이 같다). 비활성은 `--color-disabled` 바탕. **녹음 정지에 `danger`를 쓰지 않는다** (빨강은 오류 전용) — 녹음 화면은 `primary`, 위젯은 `secondary` |
| `Badge` | `tone`: `neutral`(회색 면) · `accent`(`--color-accent-soft` 바탕 + 강조 글자) · `success`(초록 글자) · `danger`(`--color-danger-soft` 바탕 + 빨간 글자). 바탕을 칠한 강한 배지는 두지 않는다 |
| `Switch` | `<button role="switch" aria-checked>`. props `isChecked`, `onChange(next)`, `ariaLabel` 또는 `ariaLabelledBy`(설정 행 제목의 id), `disabled`. 켜짐은 잉크, 꺼짐은 `--color-disabled`. 크기 40×24, 손잡이 20(2026-10-22 시안). Space·Enter는 네이티브 버튼 동작으로 토글된다 |
| `Stepper` | 숫자 입력 + −/+ 버튼. **값은 문자열**(`value`, `onChange(text)`) — 입력 중 비어 있거나 잘못된 값을 부모가 그대로 들고 검증하기 때문이다 (`useSpeakerCount`). props `min`, `max`, `label`(입력 이름), `placeholder`, `isInvalid`. 동작: 빈 값(또는 정수가 아닌 값)에서 + 는 `min`, − 는 비활성. `min`에서 − 는 **값을 비운다**("모름"). `max`에서 + 는 비활성. 범위를 넘는 값에서 −/+ 는 범위 안으로 끌어온다 |
| `LevelWaveform` | 이퀄라이저형 레벨 미터. `LevelMeter`(가로 막대)를 대체한다. props `level`(0~1, 현재 세기), `barCount`. **모든 막대가 현재 레벨에 함께 반응**한다 — 가운데가 높고 양끝이 낮은 종 모양 포락선에 막대별 고정 계수를 곱하고, 레벨에 비례한 진폭으로 막대마다 다른 주기의 CSS `transform` 흔들림을 준다(노래방 이퀄라이저 느낌, 2026-09-26 사용자 요청). 무음이면 점만 남는다. 처음 구현은 0.5초마다 오는 레벨을 왼쪽부터 칸에 쌓는 이력형이었는데 24초 동안 채워지는 모양이 진행 바로 읽혀 바꿨다. 이력·타이머·오디오 분석이 없고 새 레벨이 올 때만 리렌더하며 흔들림은 컴포지터 애니메이션이라 추가 비용이 없다. `prefers-reduced-motion`이면 흔들림을 끈다 |

레이아웃 공통 컴포넌트는 `shared/components/primitives/layout`에 둔다. 여러 위젯이 같은 모양을 써야 해서 위젯의 `ui` 세그먼트가 아니라 공용이다.

| 컴포넌트 | 계약 |
| --- | --- |
| `TopBar` | 본문 상단 52px 바. `title`(왼쪽 회색 글자) + `children`(오른쪽 동작). 바 전체가 창 끌기 영역이고 안의 컨트롤은 `no-drag` |
| `SettingGroup` | 설정 카테고리 — 제목(`h2`, 본문색 15px 600 — 2026-10-22 설정 모달의 카테고리 제목 자리. 그 전에는 회색 소제목) + 행 목록. `aria-labelledby`로 제목과 묶는다. 설정 모달은 카테고리를 한 번에 하나만 그리므로 카테고리 사이 간격(옛 144px)은 없다 |
| `SettingRow` | 설정 한 행 — 왼쪽 제목(14px 500)·설명(13px, 줄 간격 1.45), 오른쪽 `control`(세로 가운데), 아래 `children`(펼침 영역). 제목 id를 `titleId`로 받아 `Switch`의 `ariaLabelledBy`에 넘긴다. 행 사이는 `--color-divider` 선 |

### 글꼴 동봉

- Google Sans(라틴·숫자), **Pretendard(한글)**, Google Sans Code(숫자·시간)를 `packages/design/src/fonts/`에 넣고 `packages/design/src/fonts.css`의 `@font-face`로 로드한다. 두 앱이 같은 파일을 쓴다.
  Google Sans에는 한글 글리프가 없어 한글은 스택의 다음 글꼴인 Pretendard로 떨어진다.
- 셋 다 **SIL OFL**이다. 배포처가 준 파일을 **수정하지 않고** 동봉한다 (OFL의 예약 글꼴 이름 조항 때문에 서브셋·변환한 파일은 원래 이름을 쓸 수 없다).
  각 글꼴의 `OFL.txt`를 같은 폴더에 둔다. 폴더는 글꼴마다 하나(`fonts/googleSans`, `fonts/googleSansCode`, `fonts/pretendard`)다.
- 파일 **이름**만 카멜 규칙에 맞춰 바꾼다 (`GoogleSans[GRAD,opsz,wght].ttf` → `googleSansVariable.ttf`). 대괄호·쉼표가 CSS `url()`과 번들러 경로에서 말썽을 부린다.
  파일 내용과 글꼴 이름(name 테이블)은 건드리지 않으므로 OFL 조항과 무관하다. 출처: Google Sans·Google Sans Code는 `google/fonts` 저장소의 `ofl/`, Pretendard는 npm `pretendard@1.3.9`의 가변 woff2.
- 오프라인 앱이라 Google Fonts CDN을 쓰지 않는다. CSP도 외부 글꼴 출처를 열지 않는다. 브라우저 프로토타입도 같은 동봉 파일을 정적 자산으로 배포한다 (CDN 없음).

### 메인 창과 사이드바 레이아웃

- 메인 창 기본 크기 **1280×800**, 최소 **1040×640**. 두 칸(사이드바 272px + 본문)이 최소 폭에서도 회의록 줄 길이를 지키는 크기다.
- `titleBarStyle: 'hiddenInset'`으로 신호등을 사이드바 위에 겹친다. 사이드바 상단 52px과 본문 상단 바는 `-webkit-app-region: drag`,
  그 안의 버튼·입력은 `no-drag`로 둔다 (`references/pitfalls.md`에 함정 추가).
- 라우터: `RequireModels` 아래에 `AppShellLayout`(사이드바 + `<Outlet />`)을 두고 홈·녹음·상세·설정을 그 자식으로 옮긴다. 온보딩·위젯은 셸 밖이다.
  `UpdateBanner`는 홈이 아니라 셸의 본문 위에 둔다 (어느 화면에서든 보이도록).
- 사이드바(`meeting/MeetingSidebarSection`) 구성: 새 녹음 버튼(녹음 중이면 경과 시간과 함께 "녹음 중"으로 바뀌고 `/record`로 이동) → 검색 입력 →
  회의 목록(오늘·이번 주·이전으로 묶음, 처리 중이면 `PipelineProgress`, 오류면 한 줄 안내) → 하단 설정 링크.
  (시안 최종본에서 "이 기기에서만 처리" 표시를 뺐다. 온보딩이 같은 내용을 말한다.)
  날짜 묶음 계산은 순수 함수로 두고 vitest로 검증한다.
- **목록 갱신**: 사이드바는 화면을 옮겨도 언마운트되지 않으므로, 예전처럼 "홈에 들어올 때 다시 불러오기"로는 제목 변경·삭제·처리 완료가 반영되지 않는다.
  main이 회의 목록에 영향을 주는 변경(녹음 시작·정지, 제목 변경, 삭제, 파이프라인 처리 시작·`done`·`error`) 뒤에 **`meetings:changed` push**를 보내고,
  사이드바가 받으면 `meetings:list`(검색 중이면 `meetings:search`)를 다시 부른다. payload는 없다 — 목록 전체를 다시 읽어도 로컬 SQLite라 싸다.
  녹음 정지·처리 시작을 넣은 이유: 정지 직후 행은 `recording`, 큐가 잡으면 `processing`으로 바뀌는데 이 둘을 놓치면 사이드바가 처리 중 진행률 대신 "녹음 중"을 계속 보여준다.
  main은 `src/main/meetingsChanged.ts`의 리스너 하나로 모으고(`notifyMeetingsChanged`), `index.ts`가 모든 창에 브로드캐스트한다 — 진행률 리스너와 같은 모양이다.

### 화면별 구성

- **회의 상세**: 상단 바(제목만) + 전체 폭 헤더(제목·메타, 제목과 같은 줄 오른쪽에 복사·마크다운 복사·더보기) + 헤더 아래 두 칸 — 가운데 회의록, 오른쪽 레일 300px에 노트 카드(2026-10-21, `features/recording.md` "녹음 노트")·요약 카드·교정 결과·화자 목록 — + **하단 고정 녹음 바**(두 칸 아래 전체 폭, "녹음본 재생·내보내기·다시 인식" 절).
  복사 버튼을 창 오른쪽 위가 아니라 제목 줄에 두고 레일을 헤더 아래에서 시작하게 한 이유(2026-09-28 사용자 요청): 복사 대상인 회의록 제목 옆에 있어야 무엇을 복사하는지 분명하고, 레일이 제목 옆까지 올라오면 제목 폭이 레일에 눌린다.
  화자 목록은 회의록과 **같은 `useMeeting` 상태**를 써야 하므로(훅 인스턴스마다 상태가 따로다) `TranscriptSection`이 레일까지 그리고,
  요약은 `aside` 슬롯으로 받는다: `<TranscriptSection meetingId aside={<SummarySection meetingId />} />`. 기존 `SpeakerBar`는 레일의 화자 목록으로 바뀐다.
  레일 폭은 회의록과 레일 사이의 **세로 핸들을 끌어** 바꾼다(2026-09-24 사용자 요청). 기본 300px, 최소 240px, 최대 560px이면서 본문 폭의 절반을 넘지 않는다(회의록이 레일에 밀려 사라지지 않게 — CSS도 `min(var(--rail-width), 50%)`로 같은 상한을 건다).
  핸들은 `role="separator"`(`aria-orientation="vertical"`, `aria-valuenow/min/max`)이고 키보드 ←/→로 16px씩 조절, 더블클릭하면 기본 폭으로 돌아간다.
  폭은 창 단위 화면 선호라 SQLite 설정에 넣지 않고 renderer `localStorage`에 저장한다(읽기·쓰기 실패 시 기본 폭으로 동작). 로직은 `TranscriptSection`의 `model/useRailResize`, 핸들은 `ui/RailResizer`에 둔다.
  요약 카드의 헤더는 접기/펼치기 토글(`aria-expanded`)이다 — 기본은 펼침이고, 접으면 본문·버튼이 숨고 헤더만 남는다. 요약이 진행 중일 때 접으면 헤더 캡션에 진행률을 대신 보여 준다. 접힘 상태는 저장하지 않는다(회의를 옮기면 다시 펼침).
  공급자 라벨(무엇으로 요약하는지)은 헤더의 "요약" 제목 바로 아랫줄에 작은 글씨로 적고, "요약 복사" 버튼은 헤더 오른쪽에 둔다(2026-09-28 사용자 요청). 버튼 안에 버튼을 둘 수 없으므로 헤더는 접기 버튼(셰브런·제목·라벨, 남는 폭을 채움)과 복사 버튼을 형제로 나란히 둔다. 복사 버튼은 요약이 있고 진행 중이 아닐 때만 보이고, 접힌 채 진행 중이면 라벨 자리에 진행률이 나온다. 본문 아래 버튼 줄에는 만들기/다시 요약만 남는다.
  회의 삭제는 더보기 안으로 들어가지만 2단계 인라인 확인 규칙은 그대로다. 더보기는 창 오른쪽 위 상단 바가 아니라 복사 버튼 바로 오른쪽에 둔다(2026-09-28 사용자 요청) — 회의 단위 동작을 한 줄에 모아 찾기 쉽게 한다.
  상단 바 제목은 회의 날짜 묶음("회의록 · 오늘")이다 — 사이드바와 같은 날짜 묶음 함수(`shared/utils/meetingDateGroup`)를 쓴다.
  발화 행은 시각 열 · (화자 + 본문) · 복사 버튼 세 칸이고, 복사 버튼은 행에 마우스를 올리거나 포커스가 들어올 때만 보인다. 화자는 색 점 + 이름의 `<select>`로 바꾼다.
  화자 색은 화자 목록 순서대로 `--color-speaker-1`~`8`을 돌려 쓴다. 화자 목록의 "화자 합치기"는 합치기 모드를 켜고, 모드 안에서 행마다 "합치기" → 대상 선택의 기존 두 단계를 거친다.
- **녹음**: 큰 타이머, 파형형 레벨 미터, 참석자 수 **스테퍼**(−/+와 숫자 입력, "모름"은 값을 비운다), 정지 버튼("녹음 정지하고 회의록 만들기").
  스테퍼는 `shared/components/primitives/ui/Stepper`로 만들어 위젯과 함께 쓴다. 참석자 수 범위·검증은 지금처럼 `@meeting-stt/core/speakerCount`.
  **2026-09-26 재배치**(사용자 요청: 녹음 직전 화면이 스크롤되고 상태가 바뀔 때마다 요소가 튄다). 두 원칙 — **페이지 스크롤 없음**(최소 창 높이 640에서 전부 들어간다)과
  **레이아웃 시프트 없음**(대기 ↔ 녹음 ↔ 일시정지, 파형 ↔ 라이브, 오류 표시 어느 전환에서도 요소가 움직이지 않는다) — 을 지키기 위해 구성을 다음처럼 고정한다.
  - **헤더**(왼쪽 정렬): 상태 점·문구, 녹음 중에 켜져 있으면 그 옆에 "상대방 소리 포함" 배지, 아래 큰 타이머(`--font-timer`). 왼쪽 정렬이라 배지가 붙거나 타이머가 `1:00:00`으로 길어져도 아무것도 밀리지 않는다.
  - 헤더 아래는 **두 칸**. 왼쪽 **무대**는 보기 카드 + 제어 행 + 안내 두 줄이다. 보기 카드는 헤더(파형 / 라이브 받아쓰기 토글)와 본문으로 나뉘고 **본문 크기는 남은 높이가 정한다** —
    파형은 본문 가운데에, 라이브 받아쓰기는 본문을 채우는 스크롤 영역(앱에서 유일하게 스크롤되는 곳)이라 보기를 바꿔도 카드 크기가 같다.
    제어 행은 높이 52px 고정이고 **버튼이 무대 폭을 꽉 채운다** (2026-09-26 사용자 요청): 대기 중 강조색 "녹음 시작" 하나, 녹음 중 일시정지 원형 버튼 + 남은 폭을 채우는 "녹음 정지하고 회의록 만들기".
    안내("창을 닫아도 계속", 단축키)는 두 줄 높이 고정. **명령·녹음 오류는 이 안내 자리에 대신** 빨간 글자로 쓴다 — 안내는 없어도 되는 정보라 오류가 있는 동안 잠시 비켜도 되고, 같은 높이라 별도 줄을 끼워 넣지 않는다.
  - 오른쪽 **옵션 패널**(340px, `aside`, 설정 화면과 같은 `SettingGroup`/`SettingRow`)이 사용자가 입력하는 것을 카테고리로 모은다.
    위 그룹 **"파일로 만들기"**: 녹음 파일 가져오기 행(녹음 중 **비활성**) — 2026-09-26 사용자 요청으로 맨 위에 둔다.
    아래 그룹 **"녹음 설정"**: 참석자 수 행(설명 + 스테퍼. 별도 "모름" 버튼은 두지 않는다 — 최솟값에서 −가 값을 비우고 placeholder가 "모름"이다), 온라인 회의 소리 행(설명 + `Switch`, 녹음 중 **비활성**, 숨기지 않는다).
    설명이 길어질 수 있는 온라인 회의 소리 행(시스템 오디오 오류 문구)이 패널의 **마지막**이라, 넘치면 아래 빈 공간으로 흘러나갈 뿐 다른 행이 밀리지 않는다.
  - **고정 규칙**: 상태에 따라 요소를 숨기거나 끼워 넣지 않고 비활성으로 바꾼다. 문구가 바뀌는 자리(행 설명·오류·안내)는 줄 수를 정해 `height`를 고정하고, 넘치면 `overflow: visible`로 여백에 흘러나가게 둔다 —
    드물게 긴 오류가 여백을 침범하는 쪽이 매번 화면이 튀는 것보다 낫다. 폭 계산: 최소 창(1040)에서 본문 768 − 패딩 64 − 패널 340 − 칸 사이 32 = 무대 332px이고 일시정지(52) + 정지 버튼(약 270) 행이 들어간다.
- **위젯**: 같은 스테퍼, 대기 중이면 강조색 "녹음 시작", 녹음 중이면 테두리형 "녹음 정지". 파형은 넣지 않는다 — 좁은 패널에서 타이머·녹음 점만으로 녹음 중임이 충분히 보인다 (2026-09-24 사용자 요청으로 제거).
  창 크기는 **300×304**(이전 264×248) — 헤더·타이머·스테퍼·버튼·안내 한 줄이 잘리지 않는 높이다.
  사이드바·위젯에는 단축키 안내를 넣지 않는다 — 두 곳 다 언마운트되지 않아 설정에서 단축키를 바꾸면 틀린 키를 보여준다 (설정 변경 push가 없다). 녹음 화면은 들어올 때마다 설정을 읽으므로 안내한다.
- **설정**: 카테고리 제목 + 행(제목·설명 왼쪽, 컨트롤 오른쪽). 켜기/끄기는 `role="switch"` 버튼인 `primitives/ui/Switch`로 바꾼다. 용어 사전 카테고리도 같은 행 규칙을 따른다.
- **온보딩**: 왼쪽 안내, 오른쪽 모델 선택 카드와 다운로드 목록("함께 받는 모델": 완료·퍼센트·대기)의 두 칸. 제목 문구는 "인터넷 사용, 비용, 시간 제한 없는 회의록"(시안).
  설정의 음성 인식 모델은 같은 `ModelDownloadSection`을 `variant="setting"`으로 그려 한 행(현재 모델 · 설치됨 + "모델 바꾸기")으로 접어 두고, 누르면 선택 카드가 펼쳐진다. 펼친 목록의 설치된 항목과 "로컬 요약 모델 파일" 행에는 "제거"(2단계 인라인 확인)가 있어 모델 파일을 하나씩 지운다 (2026-10-22, `distribution.md` 3절 `models:remove`).
- 제목은 굵은 산세리프(명조 없음). 아이콘은 인라인 stroke SVG이고 아이콘 전용 버튼에는 `aria-label`을 붙인다.

### 회의록 검색 (`meetings:search`)

| 키 | 채널 | 방향 | 요청 → 응답 |
| --- | --- | --- | --- |
| `meetings.search` | `meetings:search` | invoke | `{ query: string }` → `MeetingSearchResult[]` |
| `events.meetingsChanged` | `meetings:changed` | push | 없음 (위 "목록 갱신") |

- `MeetingSearchResult = { meeting: Meeting; match: { utteranceId: string; text: string; startSec: number } | null }`.
  제목으로만 걸리면 `match`는 `null`, 발화로 걸리면 **순서(`ord`)가 가장 앞선 발화 하나**를 준다.
- 대상은 **회의 제목과 발화 텍스트**. 화자 이름·요약은 넣지 않는다 (필요해지면 추가).
- main은 `query`를 trim하고 비면 빈 배열을 돌려준다. `LIKE '%' || ? || '%' ESCAPE '\'`로 찾고 `%`·`_`·`\`는 이스케이프한다.
  SQLite `LIKE`는 ASCII 대소문자를 구분하지 않아 영문 용어도 그대로 찾힌다. 정렬은 `created_at DESC`, 최대 50개(`SEARCH_RESULT_LIMIT`).
  이스케이프 함수(`toLikePattern`)는 `src/main/searchQuery.ts`에 두고 `searchQuery.test.ts`로 검증한다 — `src/main/db/*`는 `better-sqlite3` 때문에 vitest가 import할 수 없다.
- **FTS5를 쓰지 않는 이유**: 기본 `unicode61` 토크나이저는 띄어쓰기로만 나눠 "회의록을"에서 "회의록"을 못 찾고,
  `trigram`은 3글자 미만 질의를 못 찾는다 (한국어 검색어는 2글자가 흔하다). 데이터가 한 사람의 로컬 회의라 전체 스캔으로 충분하다.
  느려지면(수천 회의) 그때 측정하고 바꾼다. 스키마 변경은 없다.
- renderer: 입력 200ms 디바운스(`SEARCH_DEBOUNCE_MS`), 검색 중에는 사이드바 목록이 결과로 바뀌고 발화 조각의 일치 부분을 `<mark>`로 강조한다.
  결과를 누르면 그 회의 상세로 간다. **해당 발화로 스크롤하는 것은 후속 과제**다. Esc·지우기 버튼으로 검색을 끝내면 원래 목록으로 돌아간다.

## 채팅창 리뉴얼 (2026-10-21 시안)

피벗(`SKILL.md` "제품 방향") 뒤 사용자가 Design 시안 "AI 비서 앱 리뉴얼 시안"(저장소 루트의 같은 이름 html, 14화면)으로 화면 구조를 정했다 —
**사이드바·페이지 없이 모든 기능을 채팅 창 하나에 둔다.** 기능의 입구는 `/` 명령 메뉴, 결과는 대화 속 카드, 문서·기록·설정은 대화 옆 패널이나 모달이다.
위 "메인 창과 사이드바 레이아웃"·"화면별 구성"은 이 절이 덮는 범위부터 옛 구조가 되고, 아직 옮기지 않은 화면(녹음·회의 상세·설정)만 그 구조로 남아 있다. **옛 구조로 되돌리지 않는다.**
이 절은 **홈 화면부터 채팅 플로우**(2026-10-22 구현)와 **설정 모달**(2026-10-22, 아래 "설정 모달")과 **처음 실행 (설정도 대화로)**(2026-10-22, 아래 소절)을 적는다. 녹음 카드·전체 기록 패널·기록 찾기은 시안에 있지만 아직 옮기지 않았다 — 옮길 때 이 절에 이어 적는다.

### 토큰 (시안 "색상 토큰")

변수 이름은 그대로 두고 **값만** 시안으로 바꿨다 (`packages/design/src/base.css`). 차가운 회색 계열 + 파란 강조로, 컴포넌트 CSS는 손대지 않는다. 글꼴은 시안의 IBM Plex(CDN)가 아니라 동봉 글꼴 그대로다 ("글꼴 동봉"의 오프라인 원칙).

| 변수 | 라이트 | 다크 |
| --- | --- | --- |
| `--color-bg` / `--color-surface` | `#FFFFFF` / `#FFFFFF` | `#111315` / `#1B1E22` |
| `--color-sidebar` / `--color-surface-hover` | `#F6F7F8` / `#F1F2F4` | `#16181B` / `#23262B` |
| `--color-border` / `--color-border-strong` / `--color-divider` | `#E2E4E8` / `#D3D6DB` / `#ECEEF1` | `#2A2E34` / `#3A3F47` / `#212429` |
| `--color-disabled` | `#CDD0D6` | `#454A52` |
| `--color-text` / `--color-text-muted` / `--color-text-inverse` | `#14161A` / `#6B717B` / `#FFFFFF` | `#ECEEF1` / `#9AA0AA` / `#14161A` |
| `--color-accent` / `--color-accent-text` / `--color-accent-soft` | `#2F5BD3` / `#FFFFFF` / `#E6ECFB` | `#7FA0F5` / `#14161A` / `#1E2A47` |
| 빨강·초록·화자 1~8 | 그대로 | 그대로 |

### 라우트

- **`/` = 채팅**(`pages/Assistant`, `PATHS.assistant`). `AppShellLayout`(사이드바) **밖**, `MainWindowLayout`·`RequireModels` 안이다. 창 상단 56px은 신호등 자리로 끌기 영역이다.
- 옛 홈(빈 상태 + 사이드바)은 **`/meetings`**(`pages/Home`, `PATHS.meetings`)로 옮겼다. 아직 사이드바 구조인 녹음·상세·설정으로 가는 다리이고, 그 화면들을 채팅 창으로 옮기면 없앤다. 회의 삭제·잘못된 id·온보딩 완료는 각각 `/meetings`·`/meetings`·`/`로 간다.
- `/assistant` 경로는 없다. 사이드바의 "비서" 링크는 `/`로 간다.

### 홈 (빈 대화)

- 위는 비어 있고 아래에 **입력 도크**(composer)만 붙는다. **기능의 입구는 `/` 명령 메뉴 하나다** — 홈이든 대화 중이든 녹음 중이든 도크 밖에 기능 상자를 두지 않는다 (2026-10-22 사용자 결정, "인풋에 슬래시 넣으면 다른 기능 다 접근 가능하니까"). 예전의 도우미 6개 그리드와 대화 중 한 줄(`HelperGrid`)은 없앴다. 녹음 안내 한 줄은 도크 바로 아래다.
- **설정만은 창 오른쪽 위 모서리의 톱니 아이콘 버튼으로도 연다** (같은 날 사용자 결정) — `pages/Assistant`의 제목 표시줄(56px 끌기 영역) 오른쪽 끝, 32px 아이콘 버튼(`aria-label` "설정 열기"), 끌기 영역에서 빼낸다(`-webkit-app-region: no-drag`). `/settings` 모달로 간다. `/` 명령 "설정"도 그대로 있다.
- 작업 폴더에 문제가 있으면 도크 위에 한 줄 안내 + 설정 링크(기존 `ChatNotice`). 모델이 없으면 그 위에 설정 카드가 선다(아래 "처음 실행"). 폴더를 한 번도 고르지 않았으면 채팅까지 오지 못한다(아래 "첫 화면").

### 입력 도크 (composer)

- 둥근 테두리(28px) 카드. 왼쪽 textarea(1줄에서 시작해 내용만큼 자람, 최대 200px), 오른쪽 **녹음 시작**(마이크, 녹음 토글. 녹음 중이면 `aria-pressed`) · **보내기**(잉크 원, 위 화살표). 실행 중이면 보내기 자리가 **중지**(네모)로 바뀐다. 입력은 실행 중에도 할 수 있고 보내기만 막는다.
- placeholder: 빈 대화 "무엇을 도와드릴까요?" → 대화 중 "이어서 묻기, / 로 명령" → 문서 패널이 열려 있으면 "이 문서에 대해 묻기". **문서가 열려 있으면 보낼 글 앞에 `@<경로> `를 붙인다**(이미 그 경로가 글에 있으면 붙이지 않는다) — 에이전트가 어느 문서인지 알게 하고, 사용자 말풍선에도 그대로 보여 숨기지 않는다.
- Enter 전송, Shift+Enter 줄바꿈, 한글 조합 중 Enter 무시는 그대로다. **에이전트 선택 `<select>`는 없앴다** — 대화의 에이전트는 설정의 값(`AssistantStatus.provider`, 저장값이 없으면 main이 설치된 첫 CLI로 채움)이고 고르는 자리는 설정 모달이다. `/` 명령 "녹음 시작"·"파일로 기록 만들기"와 마이크 버튼은 `controlRecordingApi`·`importMeetingAudioApi`를 바로 부른다(녹음 카드는 `recorderSlot`으로 입력 도크 위에 붙는다).
- **`/` 명령 메뉴**: 글 맨 앞의 `/` 토큰이 커서 아래 있으면 도크가 위로 펼쳐져(반경 24px) 두 묶음을 보여 준다 — "명령"(내장 6개)과 "스킬 · 작업 폴더와 내 스킬"(`assistant:listSkills`). 토큰 뒤 글자로 이름·설명을 거른다. 내장 명령을 고르면 바로 실행하고 입력을 비우며, 스킬을 고르면 입력을 `/<이름> `으로 바꾼다(인자를 적고 보낸다 — `claude -p`는 프롬프트 맨 앞의 `/이름`을 스킬로 푼다). 내장 명령 "새 대화"는 단축키 **`⌘N`**(`AppSettings.newChatShortcut`, DB `shortcut.newChat`, 설정 "단축키"에서 바꾸거나 끈다, 2026-10-22 사용자 요청)으로도 실행한다 — 전역 단축키가 아니라 채팅 창의 `keydown`이라 다른 앱의 ⌘N을 건드리지 않고, 설정 화면이 새 키를 입력받는 중(`preventDefault`된 이벤트)에는 듣지 않는다. 설정 모달은 채팅 위에 떠 있어 채팅이 언마운트되지 않으므로 `useSettings`가 `settings:changed` push를 구독해 바뀐 키를 바로 따른다(녹음 안내의 단축키도 같이 맞는다).
- **`@` 파일 선택**: 커서 아래 토큰이 `@`로 시작하면 같은 모양으로 "파일 · 작업 폴더"를 보여 준다 — 문서 목록(`useWorkspaceFiles`, 부제는 "<상위 폴더> 폴더")과 그 폴더들(`meetings/` · "폴더 전체를 붙여요"). 고르면 토큰을 `@<경로> `로 바꾼다. 각 묶음은 앞 8개까지만 보여 준다.
- 메뉴는 `role="listbox"`/`option`, textarea에 `aria-controls`·`aria-expanded`. ↑/↓로 고르고 Enter로 확정(이때 전송하지 않는다), Esc로 닫는다(글을 바꾸면 다시 열린다). 토큰 찾기·거르기·바꾸기는 순수 함수(`utils/menuQuery.ts`, vitest).

### 대화

- 사용자 턴은 오른쪽 정렬 회색 말풍선(최대 80%). 에이전트 턴은 **도구 줄 → 답변 글 → 바뀐 파일 칩 → 오류** 순서이고 실행 중이면 마지막 턴 끝에 파란 점 + "작업하는 중". 점은 숨쉬듯 줄었다 커지며 물결이 퍼지고 글자 위로 밝은 띠가 지나간다. 새 말풍선·답변 자리는 아래에서 살짝 떠오른다 (모션 줄이기 설정이면 모두 멈춘다).
- 도구 줄은 아이콘 + 한국어 라벨 + 대상(mono): `Read`·`Glob`·`Grep`·`LS`·`NotebookRead` → "읽음", `Write`·`Edit`·`MultiEdit`·`NotebookEdit` → "고침", `Bash`·`Shell` → "실행", `WebFetch`·`WebSearch` → "열어봄", 그 밖은 도구 이름 그대로 (`utils/toolLabel.ts`, vitest).
- 바뀐 파일 칩 "`<파일> 열기`"는 문서 패널을 그 파일로 열고, 열려 있으면 "`<파일> 열림`"(`aria-pressed`)이다. 작업 폴더 밖 파일은 칩이 아니라 글자다 (`isOpenableFile` 그대로).
- **답변은 마크다운으로 그린다** (2026-10-22 사용자 요청) — `shared/components/primitives/ui/Markdown`이 **`react-markdown` + `remark-gfm`**(표·취소선·할 일 목록)으로 React 요소를 만든다. `innerHTML`을 쓰지 않고 본문의 생(raw) HTML은 버리므로 답변에 섞인 태그가 실행되지 않는다. 링크는 `target="_blank"`로 두어 main의 `setWindowOpenHandler`가 `https:`만 기본 브라우저로 연다(창 안 이동 없음). 사용자 말풍선은 평문 그대로다. 녹음 노트(`features/recording.md` "녹음 노트")를 앱 안에서 그릴 때 같은 컴포넌트를 쓴다(후속).
- **답변 복사** (같은 날 사용자 요청) — 에이전트 턴 **맨 아래**(칩·오류 뒤) 28px **테두리 없는** 고스트 아이콘 버튼(`ui/CopyAnswerButton`, `aria-label` "답변 복사", 회색 아이콘만 두고 올리면 잉크색·옅은 배경)이 그 턴의 **마크다운 원문을 한 번에** `clipboard:writeText`로 넣고 2초간 체크 아이콘·"복사했습니다"로 바뀐다. 턴 안의 칩은 답변의 일부, 복사는 답변에 대한 액션이라 섞지 않는다. 실행 중인 마지막 턴에는 아직 보이지 않는다. 실패하면 버튼 옆에 `common.copyFailed`.
- **보낸 말풍선은 맨 위로** (2026-10-22 사용자 요청) — 질문을 보내면 그 말풍선이 대화 영역 맨 위에 오도록 스크롤한다(위로 올려 읽던 중이어도). 대화 끝의 빈 여백이 "마지막 사용자 말풍선부터 끝까지가 화면 높이에 못 미치는 만큼"이라 답변이 자라면 줄고 화면을 넘으면 0이다. 그 뒤로는 아래 80px 안이면 새 글을 따라 내려가는 규칙 그대로다.
- 답변 글의 최대 폭 680px, 가운데 정렬. 문서 패널이 열리면 채팅 칸이 좁아지고 패널은 오른쪽 **520px**이다.

### 문서 패널 (대화 옆)

- `DocumentEditorSection`을 오른쪽 카드(반경 20px, 그림자, 바깥 여백 12px)로 그린다. 헤더 56px: 문서 아이콘 · 제목(열린 문서 경로, 없으면 "문서") · "저장 ⌘S"(바뀐 것이 없으면 비활성) · 닫기(×). 문서가 열려 있으면 아이콘 자리가 "문서 목록" 버튼(←)이 되어 누르면 목록으로 돌아간다. 그 아래 외부 변경 안내 줄, 본문은 mono textarea.
- **열린 문서가 없으면 본문에 작업 폴더의 파일 트리**를 보여 준다(2026-10-22) — 폴더 먼저·이름순, 폴더는 눌러 접고 펴며(`aria-expanded`, 처음엔 모두 접힘), 파일을 누르면 연다. 펼친 폴더는 문서를 열었다 목록으로 돌아와도 남는다. 트리 만들기는 순수 함수(`utils/fileTree.ts`, vitest). 예전의 헤더 `<select>`는 없앴다 — 문서가 수백 개라 드롭다운 안에 숨기면 본문에는 "문서를 고르세요"만 보였다.
- 페이지가 `openPath`와 `isDocumentOpen` 둘을 든다 — "문서 열기" 명령은 파일 없이 패널만 열어 고르게 하고, 칩은 파일과 함께 연다. 닫으면 패널을 언마운트하고 저장하지 않은 변경은 기존 규칙대로 저장한다.

### IPC

| 키 | 채널 | 방향 | 요청 → 응답 |
| --- | --- | --- | --- |
| `assistant.listSkills` | `assistant:listSkills` | invoke | 없음 → `AssistantSkill[]` (`{ name, description }`) |

- main(`src/main/assistant/skills.ts`)이 `<작업 폴더>/.claude/skills/*/SKILL.md`와 `~/.claude/skills/*/SKILL.md`를 읽어 머리말의 `name`·`description`을 꺼낸다(없으면 폴더 이름·빈 문자열). 같은 이름은 작업 폴더 쪽이 이긴다. 머리말 해석은 순수 함수(`skillFrontmatter.ts`, vitest). 플러그인 스킬·`.claude/commands`는 보지 않는다.
- renderer는 `useWorkspaceSkills({ folder })`로 화면을 열 때 한 번 읽는다. 폴더 감시(`assistant:filesChanged`)는 점 폴더를 거르므로 스킬 변경은 알리지 않는다 — 스킬을 새로 만들면 화면을 다시 연다.

### 녹음 (2026-10-22, 시안 "녹음 중 · 입력창 위에 붙음" · "녹음 후 · 기록 카드" · "녹음 위젯 패널")

설계는 `features/recording.md` "채팅 창의 녹음" 절이다. 요점만 적는다 — 마이크 버튼·`/` 명령이 녹음을 바로 시작하고(`/record`는 없앴다), 녹음 중에는 입력 도크 위에 **녹음 카드**(`recording/RecorderSection`, 페이지가 `recorderSlot`으로 넘긴다)가 붙고 도크 아래 한 줄 안내("창을 닫아도 녹음은 계속돼요 · ⌥⌘R")가 생긴다.
정지하면 채팅으로 돌아와(`location.state.stoppedMeetingId`) "녹음을 멈췄어요" 줄과 **기록 카드**(`features/meeting/RecordCard` — 처리 중 진행률 → 제목·메타·요약·화자·교정 수·"전체 기록 보기")가 대화 끝에 붙는다. 앱을 켠 뒤 만든 회의(파일 가져오기 포함)마다 카드 하나다.
위젯 패널은 시안 외형으로 바꿨고, 시스템 오디오 스위치는 설정 "마이크"로 옮겼다. "전체 기록 보기"와 "기록 찾기" 결과는 **전체 기록 패널**(`meeting/TranscriptSection`, 문서 패널과 같은 자리의 600px 카드)을 열고, "기록 찾기"는 도크의 찾기 모드 → 대화 속 결과 카드다. 옛 홈·회의 상세·녹음 화면·사이드바는 지웠다 (`features/recording.md` "전체 기록 패널"·"기록 찾기"·"옛 페이지 제거").

### 설정 모달 (2026-10-22, 시안 "설정 · 큰 모달로 열림")

- 설정은 페이지가 아니라 **채팅 창 위에 뜨는 큰 모달**이다. `pages/Settings`가 네이티브 `<dialog>`를 마운트 즉시 `showModal()`로 열고(포커스 가둠·Esc·배경은 플랫폼이 준다), 닫기(×)·Esc·배경 클릭이면 `onClose`에서 이전 화면으로 돌아간다(`navigate(-1)`, 첫 화면이면 `/`).
  경로는 그대로 **`/settings`**다 — 설정으로 가는 링크(`RefinePanel`·`SummarySection`·`RecordingBar`·`ChatNotice`·사이드바·요약 템플릿 "설정으로")는 바꾸지 않았다. **`/settings`는 채팅 라우트(`/`)의 자식**이라 `pages/Assistant`의 `<Outlet />`에 그려지고, 시안처럼 모달 뒤에 채팅(입력 도크)이 보인다. 다른 화면에서 설정을 열어도 뒤는 채팅이고 닫으면 원래 화면으로 돌아간다.
- 모양: 창에서 32px 안쪽, 반경 `--radius-xl`, `--color-border` 테두리, 큰 그림자, 배경(`::backdrop`)은 **`--color-backdrop`**(추가 토큰, 라이트 `rgba(20, 22, 26, 0.36)` · 다크 `rgba(0, 0, 0, 0.6)`).
  헤더 60px: "설정"(`h2`, `--font-lg` 600) + 닫기 아이콘 버튼(32px, `aria-label` "설정 닫기"). 그 아래 두 칸 — 왼쪽 **카테고리 nav 220px**, 오른쪽 **본문**(패딩 32px·40px, 최대 폭 760px, 세로 스크롤).
- 카테고리는 14개이고 **한 번에 하나만** 그린다(`useState`, 처음은 "개인 비서" — 단, 설정으로 오는 링크가 `navigate(PATHS.settings, { state: { category } })`로 카테고리를 넘기면 그것을 먼저 연다. 요약 템플릿 편집의 "설정으로"가 `summaryTemplate`을 넘긴다. 모르는 값은 `isSettingsCategory`가 걸러 기본으로). 순서: 개인 비서 · 화면 · 마이크 · 녹음·처리 · 녹음 위젯 · 단축키 · 받아쓰기 · 음성 인식 모델 · 요약 · 용어 초안 · 요약 템플릿 · 용어 사전 · 업데이트 · 언어 · 피드백.
  nav 항목은 버튼(현재는 `aria-current="true"`, 13px, 반경 `--radius-sm`, 현재·hover는 `--color-surface-hover`). 본문은 카테고리 위젯 하나 — `AssistantSettingSection` · `SettingsSection category="…"`(화면·마이크·녹음·처리·녹음 위젯·단축키·업데이트·언어·피드백 여덟 묶음 중 하나를 `category`로 고른다. 예전의 `children` 슬롯은 없앴다) · `DictationSection` · `ModelDownloadSection variant="setting"` · `LlmSection` · `SummaryTemplateSection` · `GlossarySection`.
  `composites/PageToc`(오른쪽 목차)는 nav가 대신하므로 지웠다.
- 행·제목은 시안 값으로: `SettingGroup` 제목은 회색 소제목이 아니라 **본문색 15px 600**(카테고리 제목 자리), `SettingRow`는 제목 14px 500·설명 13px(줄 간격 1.45)·컨트롤 세로 가운데, `Switch`는 40×24(손잡이 20), 설정의 `<select>`는 34px. `Button`은 **알약형**(`--radius-full`, `md` 34px)으로 바꿨다 — 시안의 모든 보드가 같은 버튼이라 설정만이 아니라 앱 전체에 적용된다.
- **"개인 비서"에 "에이전트" 행**(시안)이 들어온다 — Claude Code / Codex `<select>`, 대화 중(턴이 있거나 실행 중)이면 비활성("대화 중에는 바꿀 수 없어요"). 채팅에서 뺀 에이전트 선택이 여기로 왔다.
  값은 `assistant.provider`(`data-model.md`)에 저장하고 `assistant:setProvider`로 바꾸며 `AssistantStatus.provider`로 읽는다 — 저장된 값이 없으면 main이 설치된 첫 CLI(Claude Code → Codex, 둘 다 없으면 Claude Code)로 채워 준다. 채팅은 `state.provider ?? status.provider`로 보낸다 (`features/assistant.md` "화면").

### 처음 실행 (설정도 대화로, 2026-10-22)

시안 보드 "처음 실행 · 설정도 대화로"·"처음 실행 · 준비 완료". 온보딩 페이지 대신 **채팅 창 안의 카드 두 장**으로 작업 폴더와 음성 인식 모델을 정한다. 모델은 이제 **선택**이다("녹음할 때만 필요해요") — 채팅은 모델 없이 열린다.

- 위젯 `assistant/SetupSection` — `useAssistantStatus`와 `useModelStatus`를 함께 보고, 페이지(`pages/Assistant`)가 채팅 섹션 **위**에 놓는다(채팅 섹션의 스크롤 영역 안으로 넣는 것은 섹션에 슬롯이 생기면 옮긴다). 폭은 채팅 본문과 같은 `--chat-width`, 창이 낮으면 카드 쪽이 스크롤된다.
- **보이는 조건**: 작업 폴더에 문제가 있거나(한 번도 고르지 않은 경우는 아래 "첫 화면"이 먼저 막는다), 필수 모델이 없는데 "나중에 받기"를 누른 적이 없을 때. 이 세션에서 폴더를 고르거나 받기·나중에 받기를 누르면 **그대로 붙어 있어** 완료 상태(두 카드 체크 + "준비가 끝났어요" + 칩)를 보여 준다. 다음 실행부터는 조건이 거짓이라 보이지 않는다.
- "나중에 받기"는 renderer `localStorage`(`assistant.setup.modelDeferred`)에 남긴다 — 창마다 달라도 되는 편의 상태라 설정 DB에 두지 않는다. 미룬 카드는 한 줄("나중에 받기로 했어요…")과 "지금 받기"로 접힌다.
- 카드 1 "작업 폴더": 단계 번호(끝나면 체크, 스크린 리더용 "완료"/"1단계"), 경로(`--font-mono`), "폴더 고르기"/"바꾸기"(기존 `assistant:chooseFolder` 대화상자). 폴더 문제는 카드 안에 `role="status"`로 알린다. 고른 결과는 `useAssistantStatus`의 **모듈 캐시**로 같은 창의 채팅 섹션에도 바로 퍼진다(훅 API는 그대로, 구독자가 없어지면 비운다).
- 카드 2 "음성 인식 모델": 모델 선택(라벨 + 용량)은 `models:status`의 `whisperOptions`, 받을 목록은 `shared/utils/planDownload`(`ModelDownloadSection/utils`에서 올렸다, 두 위젯이 같이 쓴다). 받는 동안은 항목별 막대 대신 **합산 한 줄**("받는 중 · 모델 N/M개 완료", `받은 / 전체`, 막대 하나, `SetupSection/utils/summarizeDownload`)과 "받는 중에 창을 닫지 마세요". 버튼은 "받기 (용량)"·"나중에 받기"이고 받는 동안은 숨긴다. 받고 나면 "기본 (권장) · 574MB · 받기 완료"와 함께 받은 모델 수.
  **"받기 취소"는 없다** — 다운로드 취소 IPC가 없고 다른 세션이 `ipc.ts`·`preload`·`handlers.ts`를 고치는 중이라 미뤘다. 완료 카드의 "바꾸기"도 없다(설정의 "모델 바꾸기"가 있다).
- 완료 줄(`role="status"`): 모델이 있으면 "준비가 끝났어요. 이제 바로 물어보거나 녹음을 시작할 수 있어요." + 칩 "녹음 시작"(`recording:control start`). 미뤘으면 "…녹음은 모델을 받은 뒤에 할 수 있어요."만. 시안의 "파일로 기록 만들기"·"/ 로 명령 보기" 칩은 녹음 카드·`/` 메뉴 작업이 붙일 때 더한다.
- 문구는 사전 `setup`(`src/shared/locales/setup.ts`). `models.onboarding` 사전과 `pages/Onboarding`·`/onboarding`은 없앴다.
- **모델 가드는 없다.** `RequireModels`와 `/record`는 옛 페이지 제거(`8deb67a`)와 함께 사라졌다. 입력 도크의 마이크·`/` 명령 "녹음 시작"은 모델 없이도 녹음을 시작할 수 있다 — 그 경우 파이프라인이 실패를 한국어로 알린다(녹음 카드 작업에서 모델 없음을 미리 막는 것이 남았다).

### 첫 화면 (작업 폴더만, 2026-10-22)

작업 폴더를 **한 번도 고르지 않았으면**(`AssistantStatus.folder === null`) 채팅 대신 **첫 화면 하나**만 보이고, 거기서는 작업 폴더 고르기만 할 수 있다 (2026-10-22 사용자 결정 — "작업 폴더를 안 누르면 아무것도 안 되도록"). 위 "처음 실행"의 카드 두 장 중 폴더 카드가 이 화면으로 앞당겨진 것이고, 모델 카드는 그대로 채팅 안에 남는다.

- 가드 `shared/routes/guards.tsx`의 `RequireFolder` — `MainWindowLayout` 아래, 메인 창의 모든 라우트(채팅·설정 모달·요약 템플릿·녹음 파일 관리) 위에 건다. 마운트될 때 `assistant:folder`로 경로만 먼저 읽고(`assistant:status`는 저장된 에이전트가 없으면 CLI 탐색의 로그인 셸을 기다려 첫 호출이 2초쯤 걸린다 — 그걸 기다리면 창이 그만큼 빈다), 그 뒤로는 `useAssistantStatus`의 값(폴더 고르기 응답이 `applyStatus`로 들어온다)을 따른다. 둘 다 모르면 아무것도 그리지 않고, 폴더가 `null`이면 `<Outlet />` 대신 `pages/Welcome`을 그린다. 이동(redirect)이 아니라 **자리 바꿈**이라 URL은 그대로이고, 폴더를 고르면(`applyStatus`로 모듈 캐시가 바뀌면) 같은 자리에 채팅이 선다. 상태 조회 자체가 실패하면 채팅으로 보내 채팅이 그 오류를 알린다. 위젯 창(`/widget`)은 가드 밖이다 — 전역 단축키·메뉴바로 녹음은 시작할 수 있고, 그 기록은 폴더를 고른 뒤 채팅에서 본다.
- 화면 `pages/Welcome`(제목 표시줄 드래그 영역 + 가운데 정렬)과 위젯 `assistant/WelcomeSection`(폴더 아이콘, 제목, 폴더 설명, "폴더 고르기" 버튼 하나 — `accent`, 화면당 하나의 강조). 고르기는 기존 `assistant:chooseFolder` 대화상자이고 실패하면 `role="alert"`로 알린다. 대화상자를 취소하면 그대로 첫 화면이다.
- `folderProblem`(폴더가 사라짐·읽기 불가)은 첫 화면 조건이 **아니다** — 한 번 고른 사용자는 채팅으로 들어가고, 거기서 설정 카드·`ChatNotice`·설정으로 고친다. 외장 드라이브가 잠시 빠진 경우에도 기록·설정을 막지 않기 위해서다.
- 문구는 사전 `setup.welcome`(제목)과 기존 `setup.folder`(설명·버튼·오류)를 같이 쓴다. 채팅의 설정 카드(`SetupSection`)는 손대지 않았다 — 폴더가 늘 있으니 1단계는 체크 상태로 보이고 모델 카드가 2단계다(인사 "두 가지만 정하면"은 그대로다. 고칠 때 이 소절을 갱신한다).

## 화면 라우트 (Phase 2)

`file://`에서도 동작해야 하므로 `createHashRouter` + `RouterProvider`를 쓴다. 라우팅 관련 코드는 `src/renderer/src/shared/routes/`에만 두고, 다른 코드는 경로 문자열을 직접 쓰지 않는다.

- `routes/paths.ts` : 경로 상수와 경로 조립 함수(`meetingDetailPath`). **컴포넌트는 여기만 import한다.**
- `routes/index.tsx` : 페이지를 물린 라우터 정의. 페이지를 import하므로, 컴포넌트가 이 파일에서 경로 상수를 가져오면 `widget → routes → page → widget` 순환 import가 된다.

리디자인(아래 "화면 디자인" 절)부터 홈·녹음·상세·설정은 **사이드바 레이아웃**(`shared/routes/layout.tsx`의 `AppShellLayout`) 안에 그려진다.
회의 목록은 페이지가 아니라 사이드바(`meeting/MeetingSidebarSection`)가 들고, `MeetingListSection`은 없앤다.

| 경로 | 페이지 | 배치하는 widget |
| --- | --- | --- |
| `/` | `pages/Assistant` | `assistant/AssistantChatSection`, `assistant/DocumentEditorSection` — 채팅 창 하나 (2026-10-22, 위 "채팅창 리뉴얼" 절). 사이드바 레이아웃 밖 |
| `/meetings` | `pages/Home` | 빈 상태 안내 ("회의를 고르거나 새로 녹음하세요"). 2026-10-22까지 `/`였다 |
| `/record` | `pages/Record` | `recording/RecorderSection` |
| `/meetings/:meetingId` | `pages/MeetingDetail` | `meeting/TranscriptSection` (오른쪽 레일에 `meeting/SummarySection`을 슬롯으로 받음) |
| `/settings` | `pages/Settings` | **설정 모달**(2026-10-22, 위 "채팅창 리뉴얼" > "설정 모달"). `/`(채팅)의 자식 라우트라 채팅 위에 뜬다 — `<dialog>` + 카테고리 nav + 카테고리 위젯 하나: `setting/AssistantSettingSection`, `setting/SettingsSection`(`category`), `setting/DictationSection`, `model/ModelDownloadSection`(`variant="setting"`), `setting/LlmSection`(`model/SummaryModelSection`·`features/refine/AutoRefineToggle` 슬롯), `setting/SummaryTemplateSection`(편집 페이지로 가는 행), `setting/GlossarySection` |
| `/summary-templates` | `pages/SummaryTemplates` | `summaryTemplate/SummaryTemplateEditorSection` (2026-09-29, 설정에서 들어오는 하위 화면) |
| `/recordings` | `pages/Recordings` | `recording/RecordingFileSection` (2026-10-21, 설정에서 들어오는 하위 화면, `references/features/recording.md` "녹음 파일 관리" 절) |
| `/widget` | `pages/Widget` | `recording/WidgetPanelSection` (위젯 창 전용, 가드 밖) |

- `/settings`는 Phase 3에서 원본 WAV 보관 옵션과 함께 추가했다. Phase 4에서 업데이트 확인 옵션(`SettingsSection`),
  음성 인식 모델 변경(`ModelDownloadSection`, 온보딩과 같은 위젯), 요약 모델 다운로드(`SummaryModelSection`)를 붙였다.
  이후 발열·팬 소음을 줄이는 '조용히 처리' 옵션(`SettingsSection`, `pipeline.quiet`)을 붙였다.
- 온보딩 페이지(`/onboarding`)는 Phase 4에서 추가했다가 2026-10-22 리뉴얼에서 없앴다 — 처음 실행 설정은 채팅 창의 카드이고(위 "처음 실행" 소절), 작업 폴더만은 같은 날부터 첫 화면이다(위 "첫 화면" 소절). 모델 가드 `RequireModels`도 `/record`와 함께 없앴고, `shared/routes/guards.tsx`에는 `RequireFolder`만 있다.
- `features/update/UpdateBanner`는 `update:available` 이벤트를 받았을 때만 나타난다 (`references/distribution.md` 7절). 리디자인부터 홈이 아니라 셸 본문 위에 둔다.
- 흐름: 사이드바(리디자인 전에는 홈)에서 "새 녹음" → `/record`(또는 위젯·단축키) → 정지 → main이 잡을 큐에 넣고 `/meetings/:meetingId`로 이동 → 처리 중 상태를 보여주다가 `pipeline:progress`의 `done`을 받으면 회의록을 다시 불러온다.
- **Phase 5-3부터 `/record`를 벗어나도 녹음은 계속된다.** 오디오 그래프가 위젯 창으로 옮겨 갔기 때문이다
  (그 전에는 `useRecorder`가 언마운트될 때 녹음을 정지했다). 대신 **앱이 종료될 때**(`before-quit`) 진행 중 녹음이 있으면
  WAV 헤더를 확정하고 잡을 큐에 넣는다. 헤더가 확정되지 않은 WAV는 파이프라인이 읽지 못한다.
- 위젯에서 정지하면 메인 창을 앞으로 가져오고 그 회의의 상세로 이동한다 (`stoppedMeetingId`). 녹음을 끝낸 직후에 보고 싶은 것은 결과 화면이다.
- Phase 2에서 진행률 **막대**는 만들지 않았다. Phase 3에서 `modules/features/pipeline/PipelineProgress`로 추가했다 (`references/architecture.md` "진행률 표시" 절).

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
