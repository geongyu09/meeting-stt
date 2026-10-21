# 기능 설계: LLM·요약

`references/architecture.md`에서 나눈 기능별 설계다. 프로세스 경계·디렉터리·IPC 규약 같은 공통 구조는 `references/architecture.md`에 있고,
다른 기능 문서의 절 이름은 그 문서의 "기능별 설계 문서" 목차에서 찾는다. 아래 `src/…`, `scripts/…`, `resources/…`는 모두 `apps/desktop/` 기준이다.

## 로컬 LLM 요약 (Phase 5)

STT·화자 분리와 **같은 방식**(외부 바이너리 spawn)으로 붙인다. 서버·HTTP·추가 런타임을 들이지 않는다.

- 엔진은 llama.cpp의 **`llama-cli`** 를 `child_process.spawn` 한다. `llama-server`(HTTP)는 쓰지 않는다 —
  단발 요약에 상주 서버·포트·프로세스 수명 관리가 필요 없고, "네트워크를 쓰지 않는다"는 원칙을 코드로도 지키기 쉽다.
- 호출 형태:

  ```
  llama-cli -m <gguf> -sysf <system.txt> -f <prompt.txt> -o <out.txt>
            -st --no-display-prompt --no-escape --no-warmup
            -c <ctxSize> -n <maxPredict> --temp <temp> -t <threads>
  ```

  - **프롬프트·시스템 프롬프트·출력은 전부 파일로 주고받는다.** 71분 회의록은 수만 자라 argv에 넣으면 길이 제한에 걸리고,
    `-e`(escape)가 기본 켜져 있어 본문의 `\n`·`\t` 같은 문자열이 제어문자로 바뀐다. `--no-escape`를 함께 준다.
  - `-st`(single-turn)로 한 턴만 돌고 종료한다. 대화 모드로 들어가면 프로세스가 stdin을 기다리며 끝나지 않는다.
  - `--no-display-prompt` + `-o`로 **결과 파일만 읽는다**. stdout에는 로드 로그·타이밍이 섞이므로 파싱하지 않는다.
  - 임시 파일은 `userData/summaries/<meetingId>/`에 만들고 잡이 끝나면 **실패해도 지운다** (정규화본과 같은 규칙).
- **긴 회의록은 map-reduce로 나눈다.** `src/shared/summary.ts`가 회의록을 발화 줄 경계로 청크 예산만큼 자르고,
  청크마다 부분 요약을 만든 뒤 부분 요약들을 이어 붙여 한 번 더 요약한다. 청크가 하나면 reduce 단계를 건너뛴다.
  분할·출력 정리는 순수 함수라 vitest로 검증한다. 청크 예산은 컨텍스트를 통째로 채우지 않고 여유를 둔다(아래 상수 절).
- **녹음 노트를 함께 넣는다** (2026-10-21, `features/recording.md` "녹음 노트"). 노트가 있으면 한 번에 요약(`buildWholePrompt`)과 합치기(`buildReducePrompt`) 프롬프트의 회의록 뒤에 "노트" 절을 넣는다 — 구간 요약(map)에는 넣지 않는다(구간마다 같은 노트가 들어가 부분 요약이 노트로 채워진다).
  지시: "사용자가 회의 중 적은 노트다. 회의록 내용과 맞고 요약에 도움이 될 때만 반영하라. 노트만 보고 회의록에 없는 결정·기한·담당자를 단정하지 마라. 노트의 링크는 관련 항목에 그대로 남겨라."
  - 예산: 노트는 공급자 청크 예산의 4분의 1까지만 넣고(`clipNote`, 로컬 약 2,200자) 회의록 청크 예산을 넣은 노트 길이만큼 줄인다 — 로컬 8K 컨텍스트를 넘기지 않기 위해서다. 외부 공급자는 예산이 커 사실상 자르지 않는다.
  - 노트만 있고 발화가 없으면 지금처럼 "요약할 내용이 없다"로 실패한다(요약 대상은 회의록이다).
- **파이프라인이 자동으로 요약하지 않는다.** 디테일 화면의 "요약 만들기" 버튼이 `summary:create`를 보낸다.
  요약 모델이 없거나 요약이 실패해도 회의록 자체는 이미 `status='done'`이어야 하기 때문이다.
- 저장은 `meetings.summary` 한 컬럼. **진행 상태용 컬럼은 만들지 않는다** — 진행은 이벤트로만 알리고,
  앱이 꺼져 진행 상태가 사라지면 사용자가 버튼을 다시 누르면 된다.

### 잡 큐 통합

요약도 STT와 같은 CPU·GPU를 쓰므로 **`src/main/pipeline/queue.ts`의 같은 큐(동시성 1)** 에 넣는다.
요약 전용 큐를 따로 두면 STT와 요약이 동시에 돌아 둘 다 느려진다 (`references/pitfalls.md`).

- 큐 항목은 `string`이 아니라 `{ kind: 'pipeline' | 'summary'; meetingId: string }`이고, `drain`이 종류에 따라
  `runPipeline` 또는 `runSummary`를 부른다.
  Phase 5-4의 용어 초안은 회의에 묶이지 않고 결과를 돌려받아야 하므로 `{ kind: 'glossary'; run }` 항목으로 넣는다 (`references/features/transcript.md` "용어 사전" 절).
- 실패 처리는 종류마다 다르다. 파이프라인 실패는 `meetings.status='error'`로 남기지만,
  **요약 실패는 회의 상태를 건드리지 않는다** — 회의록은 멀쩡하고 요약만 없는 상태이므로 이벤트로만 알린다.

### IPC (Phase 5)

```ts
summary: { create: 'summary:create' },
events: { progress: 'pipeline:progress', summary: 'summary:progress' }
```

- `summary:create`는 큐에 넣기만 하고 즉시 반환한다(응답 없음). 요약은 수 분이 걸려 `invoke`를 매달아 둘 수 없다.
  Phase 3의 "뮤테이션은 갱신된 `MeetingDetail`을 돌려준다" 규약의 예외다 — 이 채널은 값을 바꾸는 게 아니라 **잡을 예약**한다.
- 진행은 `summary:progress`로 push한다: `{ meetingId, stage, percent, summary?, errorMessage? }`.
  `stage='done'`일 때 **요약 텍스트를 함께 실어 보내** renderer가 다시 조회하지 않게 한다.
- `stage='error'`이면 `errorMessage`(한국어)를 함께 보낸다. 회의 상태는 그대로 `done`이다.

### 화면

| 경로 | 페이지 | 추가되는 widget |
| --- | --- | --- |
| `/meetings/:meetingId` | `pages/MeetingDetail` | `meeting/SummarySection` (`TranscriptSection` 위) |

- `SummarySection`은 회의가 `done`이고 발화가 있을 때만 버튼을 활성화한다. 요약이 이미 있으면 본문을 보여주고 "다시 만들기"를 제공한다.
- 요약 텍스트는 마크다운으로 렌더링하지 않는다. 라이브러리를 들이지 않기 위해 **줄바꿈을 보존한 일반 텍스트**로 표시한다.

### 바이너리·모델 확보 (Phase 5)

| 대상 | 확보 방법 | 배치 위치 |
| --- | --- | --- |
| `llama-cli` + 의존 dylib | `ggml-org/llama.cpp` 릴리스의 `llama-<build>-bin-macos-arm64.tar.gz`를 받아 필요한 파일만 꺼낸다 | `resources/bin/darwin-arm64/` |
| 요약 모델 | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (Hugging Face, Apache-2.0) | `scripts/fixtures/models/` (Phase 1 규칙과 동일), 앱은 `userData/models/` |

- llama.cpp 실행 파일의 rpath는 `@loader_path`라 **바이너리와 dylib을 같은 폴더에** 두면 그대로 동작한다 (sherpa-onnx와 같은 구조).
- 아카이브가 `tar.gz`라 `scripts/shell.ts`의 `extractArchive`는 압축 방식을 고정하지 않고 `tar -xf`로 자동 판별한다.
- 릴리스 빌드 번호(`b10622` 등)는 `scripts/assets.ts`에 상수로 고정한다. 최신 빌드를 자동 추적하면 체크섬이 매번 바뀐다.

## 요약 템플릿 (2026-09-29)

사용자 요청. 요약 결과의 **모양**을 사용자가 정할 수 있게 한다. AI·프롬프트를 모르는 사람도 만질 수 있도록
**미리 준비된 블록을 위에서부터 쌓는 방식**(블록 코딩)으로 템플릿을 만들고, 요약할 때마다 템플릿을 고른다.
사용자는 프롬프트를 한 글자도 쓰지 않는다 — 블록마다 검증된 지시문 조각을 코드가 갖고 있고, 쌓은 순서대로 이어 붙여(컴파일) 요약 형식을 만든다.

사용자 결정 (2026-09-29):

- **요약할 때마다 템플릿을 고른다.** 요약 카드에서 기본 선택은 기본 템플릿이고, 고른 것을 기억하지 않는다.
- **기본 템플릿은 지금 형식 그대로다** — `핵심 요약` / `결정 사항` / `다음 할 일`. 코드에 내장되어 수정·삭제할 수 없다.
- **1차는 중첩 없이 평평하게 쌓는다.** "주제마다·참석자마다 반복" 같은 블록 안의 블록은 로컬 모델로 측정한 뒤 2차에 검토한다. 블록 카탈로그는 이후 계속 늘린다.
- **공유(내보내기·가져오기)는 하지 않는다.**
- 블록의 손잡이(개수·글머리/문단/표·빈 경우 처리)는 1차에 넣지 않는다. 사용자가 바꿀 수 있는 건 **제목(heading)** 뿐이다.

### 블록 모델

순수 로직은 `src/shared/summaryTemplate.ts`(카탈로그·컴파일·검증·미리보기) + 테스트. 웹 앱은 요약을 쓰지 않아 `packages/core`로 올리지 않는다.

```ts
// src/shared/types.ts
type SummaryBlockKind =
  | 'oneLine' | 'overview' | 'topics' | 'speakers' | 'decisions'
  | 'actions' | 'openQuestions' | 'numbers' | 'quotes' | 'custom'

interface SummaryBlock {
  kind: SummaryBlockKind
  heading: string            // 결과에 `## <heading>`으로 찍힌다. 기본값은 카탈로그의 한국어 제목
  description?: string       // custom만. "무엇을 적을지" 한 줄
}

interface SummaryTemplate {
  id: string                 // 내장 기본 템플릿은 'default', 사용자 템플릿은 uuid
  name: string
  blocks: SummaryBlock[]
  isBuiltIn: boolean
}
```

카탈로그(블록 종류마다 코드가 가진 것): 기본 제목, 최종 지시문(`finalInstruction`), 긴 회의의 구간 요약에서 모아 둘 **재료**(`material`).

| kind | 기본 제목 | 최종 지시문 요지 | 재료 |
| --- | --- | --- | --- |
| `oneLine` | 한 줄 요약 | 회의 전체를 한 문장으로 | 논의 |
| `overview` | 핵심 요약 | 가장 중요한 것부터 5개 이내 (기존 문구 그대로) | 논의 |
| `topics` | 논의 사항 | 주제마다 한 줄: 무엇을 논의했고 결론이 무엇인지 | 논의 |
| `speakers` | 참석자별 발언 | 회의록에 나온 화자 이름마다 주요 의견. 번호 라벨(`화자 1`)은 그대로 쓰고 이름을 지어내지 않는다 | 발언 |
| `decisions` | 결정 사항 | 확정된 것만 5개 이내, 없으면 "없음" (기존 문구 그대로) | 결정 |
| `actions` | 다음 할 일 | 기존 문구 그대로 (이름·기한은 회의록에 나온 경우에만) | 할 일 |
| `openQuestions` | 미해결 · 보류 | 결론이 나지 않았거나 다음으로 미룬 것. 없으면 "없음" | 미해결 |
| `numbers` | 숫자 · 일정 | 회의록에 나온 수치·날짜를 원문 그대로. 계산하거나 추정하지 않는다 | 숫자 |
| `quotes` | 주요 발언 | 핵심 발언 3개 이내를 원문 그대로 인용, 화자 이름과 함께 | 인용 |
| `custom` | (사용자 입력) | 사용자가 적은 `description`을 "- (…)" 지시로 감싼다 | 논의 |

- 블록 이름·설명(블록 모음에 보이는 문구)은 UI 사전(`src/shared/locales/summaryTemplate.ts`, `ko`·`en`)에 둔다.
  **기본 제목과 지시문은 언어 설정과 무관하게 한국어다** — 요약 언어는 UI 언어가 아니다 ("UI 언어" 절).
- 같은 종류는 템플릿에 한 번만 넣는다. `custom`만 여러 개 넣을 수 있다.

### 컴파일

`compileTemplate({ blocks })` → `{ finalFormat, chunkFormat, headings }`.

- `finalFormat`: 블록 순서대로 `## <heading>\n- (<finalInstruction>)`를 빈 줄로 이어 붙인다. 지금의 `FINAL_FORMAT` 자리에 들어간다.
- `chunkFormat`: 긴 회의의 map 단계 형식. 템플릿에 쓰인 블록들의 **재료를 중복 없이, 카탈로그의 고정 순서로** 모아 만든다.
  재료를 블록이 아니라 종류로 두는 이유는 `oneLine`·`overview`·`topics`처럼 같은 재료(논의)를 쓰는 블록이 여럿이라 구간 요약이 부풀지 않게 하기 위해서다.
  구간 요약에서 모으지 않은 재료는 reduce 단계에서 만들 수 없다 — 인용 블록이 있으면 구간마다 인용을 모아야 한다.
- `headings`: 결과 검증용. 요약이 끝나면 각 `## <heading>`이 결과에 있는지 확인하고, 빠지면 **경고 로그만 남기고 그대로 저장한다**
  (1차. 재시도는 로컬 요약 시간을 두 배로 만들어 측정 뒤 결정).
- **기본 템플릿의 컴파일 결과는 기존 `FINAL_FORMAT`·`CHUNK_FORMAT`과 글자 하나 다르지 않아야 한다** — 단위 테스트로 고정한다.
  이미 측정(`docs/phase5-results.md`)을 거친 형식을 그대로 지키기 위해서다.
- `SUMMARY_SYSTEM_PROMPT`(지어내지 말 것, 번호 라벨은 이름이 아님)는 템플릿과 무관하게 항상 붙는다. `custom` 블록의 설명도 이 규칙 아래에서 돈다.
- `buildWholePrompt`·`buildChunkPrompt`·`buildReducePrompt`는 형식 문자열을 인자로 받는다.

### 제약 (저장 시 main이 검증, 어기면 거절)

| 항목 | 값 |
| --- | --- |
| 템플릿 이름 | 1~30자, 사용자 템플릿끼리 중복 불가 |
| 사용자 템플릿 수 | 최대 20개 |
| 블록 수 | 1~10개 |
| 제목 | 1~30자, 줄바꿈·`#` 불가 (결과의 마크다운 제목 구조가 깨진다) |
| `custom` 설명 | 1~100자, 줄바꿈 불가 |

- 로컬 공급자는 블록이 많을수록 형식을 놓치기 쉽다. 편집기에서 블록이 **6개를 넘으면** "로컬 모델은 블록이 많으면 일부를 빠뜨릴 수 있어요" 안내를 보인다(막지는 않는다).
  임계값 6은 잠정값이며 `scripts/summarize.ts --template`로 측정한 뒤 고친다.

### 저장·IPC

- 사용자 템플릿은 `summary_templates` 테이블(`data-model.md`). 내장 기본 템플릿은 DB에 넣지 않고 코드 상수(`DEFAULT_SUMMARY_TEMPLATE`)다.
- 채널 (뮤테이션은 갱신된 목록을 돌려준다):

  ```ts
  summaryTemplates: {
    list: 'summaryTemplates:list',     // () → SummaryTemplate[]  (내장 기본이 맨 앞, 나머지는 만든 순)
    save: 'summaryTemplates:save',     // SaveSummaryTemplateRequest { id?, name, blocks } → SummaryTemplate[]  (id 없으면 새로 만든다)
    delete: 'summaryTemplates:delete'  // { id } → SummaryTemplate[]
  }
  ```

  내장 기본 템플릿의 `save`·`delete`는 거절한다. DB에서 읽은 `blocks` JSON은 `unknown`으로 받아 좁히고, 모르는 `kind`의 블록은 버린다(블록이 하나도 남지 않으면 그 템플릿은 목록에서 뺀다).
- `summary:create`의 `CreateSummaryRequest`에 `templateId?: string`을 더한다. 없으면 기본 템플릿이다.
  템플릿은 **잡이 시작할 때** 읽는다 — 큐에 있는 동안 템플릿이 지워지면 기본 템플릿으로 요약하고 경고 로그를 남긴다.
- 요약 결과에 어느 템플릿을 썼는지는 저장하지 않는다(1차). "다시 요약"도 기본 템플릿이 선택된 채로 시작한다.

### 화면

- **전용 페이지 `/summary-templates`** (`pages/SummaryTemplates`) — 편집기는 설정 카테고리 안에 두지 않고 따로 연다 (2026-09-29 사용자 요청).
  블록 모음·쌓인 블록·미리보기가 한 화면에 필요해 설정의 다른 카테고리 사이에 끼우면 좁고 길어서다.
  편집기 위젯은 `widgets/summaryTemplate/SummaryTemplateEditorSection`이고, 페이지는 상단 바("설정으로" 버튼)와 `h1` 아래에 그것만 배치한다.
  사이드바에서는 설정의 하위 화면이므로 "설정" 항목을 강조한 채로 둔다.
- **설정 "요약 템플릿" 카테고리** — `widgets/setting/SummaryTemplateSection`. "요약 · 용어 초안" 바로 아래.
  한 행에 "내가 만든 템플릿 N개" 설명과 **"템플릿 관리" 버튼**만 두고, 누르면 `/summary-templates`로 이동한다.
- **편집기(`SummaryTemplateEditorSection`)**:
  - 위: 템플릿 목록을 **두 그룹**으로 나눈다 (2026-09-29 사용자 요청 — "기본"과 "새 템플릿"이 같은 줄·같은 모양이면 고를 대상과 만드는 동작이 구분되지 않는다).
    "기본 제공" 그룹에 기본 템플릿("기본" 표시, 편집 불가·"복제해서 만들기"만), "내 템플릿" 그룹에 사용자 템플릿.
    **"새 템플릿"은 "내 템플릿" 그룹 끝의 점선 `+` 항목**이다 — 만든 결과가 들어갈 자리에 둔다. 한도에 닿으면 비활성. 내 템플릿이 없으면 그 그룹엔 `+` 항목만 보인다.
  - 편집기: **블록 모음**(카드 목록, 이미 넣은 종류는 비활성) + **쌓인 블록**(위→아래 순서가 결과 순서) + **결과 미리보기**.
  - **좌우 두 칸 배치** (2026-09-29 사용자 요청 — 세로 한 줄이면 블록 모음과 쌓인 블록 사이를 오르내려야 한다).
    왼쪽은 블록 모음(세로 목록, 스크롤해도 따라오는 sticky), 오른쪽은 **블록을 놓는 곳**(쌓인 블록) → 결과 미리보기 → 저장 버튼.
    블록 모음 칸은 220px. 편집기 폭이 좁으면(컨테이너 쿼리 기준 520px 미만) 한 칸으로 접는다. 페이지 본문 최대 폭은 1080px.
    - **블록 모음 → 놓는 곳 드래그앤드롭**: 카드를 끌어 쌓인 블록의 원하는 자리(블록 사이, 끝)에 놓으면 그 자리에 들어간다. 놓을 자리는 가로 선으로 보여 준다.
      끌기 데이터는 `dataTransfer`의 전용 MIME(`application/x-summary-block-kind`)에 종류를 담아, 앱 밖 파일·글자를 놓으면 받지 않는다.
      카드를 **누르면** 맨 아래에 붙는 동작도 그대로 둔다(키보드 경로).
    - 순서 바꾸기는 같은 놓는 곳 안에서 HTML5 드래그(손잡이)와 블록마다 ↑↓ 버튼 둘 다. 놓는 자리는 "i번째 블록 앞 / 끝" 삽입 위치로 통일한다.
      드래그 라이브러리는 들이지 않는다. 키보드만으로 추가·이동·삭제·제목 수정이 되어야 한다.
    - 블록 카드 안에서 제목을 바로 고친다. `custom`은 설명 칸이 하나 더 있다.
    - 미리보기는 **AI에게 보내는 지시문이 아니라 결과 모양**이다 (`buildTemplatePreview` → `## 결정 사항\n- …` 같은 뼈대). 지시문 전문은 "AI에게 보내는 지시 보기"로 접어 둔다.
  - 저장은 버튼으로 한다(용어 사전과 같음). 삭제는 2단계 인라인 확인.
- **요약 카드(`meeting/SummarySection`)** — 만들기/다시 요약 버튼 옆에 템플릿 선택(`<select>`, 기본 템플릿 선택됨). 사용자 템플릿이 없으면 선택 칸을 숨긴다.
  목록은 `useSummaryTemplates` 훅(`shared/hooks/domain/summaryTemplate/`)으로 읽는다 — 설정 화면과 요약 카드 두 곳이 쓰기 때문이다.
- 요약 결과는 지금처럼 줄바꿈을 보존한 일반 텍스트로 보여 준다(마크다운 렌더링 없음).

## LLM 공급자 (2026-09-24)

요약과 용어 초안은 **LLM을 부르는 방식이 같고 프롬프트만 다르다.** 사용자가 이미 구독하거나 발급받은 Claude·GPT를 쓸 수 있게
LLM 호출을 `src/main/llm/*`의 **공급자 추상화** 뒤로 모으고, 설정에서 공급자를 고른다. 지원 외부 LLM은 Claude와 GPT다 (SKILL.md 1절).

### 다섯 공급자

| `LlmProvider` | 실행 | 준비 조건 | 비용·전송 |
| --- | --- | --- | --- |
| `local` (기본) | `llama-cli` spawn (기존 방식 그대로) | `llama-cli` + 요약 모델 | 없음. 회의록이 기기 밖으로 나가지 않는다 |
| `claude-api` | `@anthropic-ai/sdk`로 Messages API 호출 (main 프로세스) | 설정에 저장한 Anthropic API 키 | Anthropic 콘솔 토큰 요금. 회의록이 Anthropic 서버로 전송된다 |
| `claude-cli` | 설치된 Claude Code `claude -p`를 `child_process.spawn` | `claude` 실행 파일 + CLI에 로그인된 구독 계정 | 구독 사용량. 회의록이 Anthropic 서버로 전송된다 |
| `openai-api` | `openai` SDK로 Responses API 호출 (main 프로세스) | 설정에 저장한 OpenAI API 키 | OpenAI 플랫폼 토큰 요금. 회의록이 OpenAI 서버로 전송된다 |
| `codex-cli` | 설치된 Codex CLI `codex exec`를 `child_process.spawn` (2026-09-29) | `codex` 실행 파일 + CLI에 로그인된 ChatGPT 구독 계정 | 구독 사용량. 회의록이 OpenAI 서버로 전송된다 |

- **회의록 전송 사실은 설정 화면의 공급자 설명에 그대로 적는다.** 로컬 우선 약속의 예외를 사용자가 알고 고르게 한다.
  외부 공급자의 자동 교정은 별도 스위치(기본 꺼짐)로 켜고, 켜면 회의가 끝날 때마다 회의록이 전송된다는 것을 스위치 설명에 적는다 (2026-09-28, "회의록 교정" 절).
- 파이프라인(STT·화자 분리)은 공급자와 무관하게 로컬이다. 공급자는 요약·용어 초안·교정에만 적용된다. 교정은 공급자에 따라 방식이 다르다 ("회의록 교정" 절).
- **API 키는 회사(`LlmApiVendor = 'anthropic' | 'openai'`) 단위로 따로 저장한다.** 공급자를 오가며 써도 키를 다시 넣지 않는다.
  키가 필요한 공급자와 회사의 대응은 `apiVendorOf(provider)` 한 곳에 둔다 (`claude-api` → `anthropic`, `openai-api` → `openai`, 나머지 null).
- **모델**: Claude API는 `claude-opus-5` 고정, 적응형 사고(`thinking: { type: 'adaptive' }`) + `output_config.effort: 'medium'`(요약은 정형 작업이라 높은 노력이 필요 없다).
  CLI는 `--model`을 넘기지 않고 **사용자가 CLI에 설정한 기본 모델**을 쓴다 — 구독 등급마다 쓸 수 있는 모델이 달라 앱이 고르면 실패할 수 있다.
  **Codex CLI는 사용자가 모델을 고른다** (2026-09-29 사용자 요청) — ChatGPT 구독으로 쓸 수 있는 모델은 API 모델 목록과 다르고 등급마다 다르다
  (실측: Plus 계정에서 `gpt-6-sol`·`gpt-6-astra`는 400 `not supported when using Codex with a ChatGPT account`, `gpt-6-luna`·`gpt-5.6-terra`는 성공).
  그래서 목록을 앱에 고정하지 않고 **`codex debug models`(CLI가 로그인 계정 기준으로 내려받은 모델 카탈로그 JSON)** 에서 `visibility === 'list'`인 모델을 `priority` 순으로 읽어 보여준다.
  선택값은 문자열 id(`llm.codexModel`)이고 **`null`이면 `-m`을 넘기지 않아 CLI 기본 모델**을 쓴다(기본값). 저장한 모델이 카탈로그에서 사라져도 값은 지우지 않고 선택지에 남겨, 실패하면 CLI 오류 문장이 그대로 보이게 한다.
  `model_reasoning_effort`는 `low`(OpenAI API의 `reasoning.effort`와 같은 이유).
  OpenAI는 **GPT-6 계열 셋 중 사용자가 고른다** (`OpenaiModelId = 'gpt-6-astra' | 'gpt-6-sol' | 'gpt-6-luna'`, 기본 `gpt-6-sol`) —
  요금이 모델마다 크게 달라 앱이 하나로 고정하면 비싼 쪽(Astra)이나 부족한 쪽(Luna)을 강요하게 된다. `reasoning.effort`는 `'low'`.
  GPT 모델 목록은 `src/shared/llm.ts`의 `OPENAI_MODELS` 한 곳에만 둔다.
- **컨텍스트 예산은 공급자가 정한다.** `local`은 기존 `CHUNK_BUDGET_CHARS`(8K 컨텍스트)로 map-reduce하고, 외부 API는 컨텍스트가 커서
  `API_CHUNK_BUDGET_CHARS`(40만 자, 약 28만 토큰)까지 한 번에 넣는다. 실무 회의록은 전부 한 번에 들어가 reduce 단계가 없다.
  `splitTranscript`의 `budgetChars` 인자로 넘기므로 순수 로직은 바뀌지 않는다.
  **Codex CLI만 예외로 `CODEX_CHUNK_BUDGET_CHARS`(20만 자, 약 14만 토큰)** 를 쓴다 — 구독 모델의 컨텍스트가 27만 2천 토큰이고 Codex 자체 기본 지시문이 앞에 붙기 때문이다.
- **생성 상한의 하한(`API_MIN_MAX_TOKENS`, 16K)도 외부 API 공통이다.** Claude의 적응형 사고와 GPT-6의 추론 토큰이 모두 출력 상한에 포함되므로 로컬용 상한(1200)을 그대로 주면 사고만 하다 잘린다.
- **GBNF 문법은 `local`에서만 쓸 수 있다.** 용어 초안은 외부 API에서는 문법 대신 출력 형식 지시문을 프롬프트 끝에 붙이고, 파싱(`parseGlossaryDraft`)이
  형식에 맞지 않는 줄을 버리는 것으로 같은 결과를 얻는다.

### 파일과 인터페이스

```
src/shared/llm.ts            # LlmProvider 유니온·기본값·한국어 라벨, API 키 회사(LlmApiVendor)·GPT 모델 목록, 준비 여부 판정(isLlmReady·llmMissingMessage),
                             # claude CLI 인자 조립·JSON 출력 파싱, 외부 API 청크 예산 (순수 함수, vitest)
src/main/llm/types.ts        # LlmClient·LlmCompleteParams 인터페이스
src/main/llm/provider.ts     # 설정을 읽어 LlmClient 하나를 만든다(createLlmClient)·현재 상태(getLlmStatus). 요약·용어 초안은 이것만 부른다
src/main/llm/local.ts        # llama-cli (기존 summary/llama.ts의 인자 조립·답변 추출을 그대로 쓴다)
src/main/llm/claudeApi.ts    # Anthropic SDK. 스트리밍으로 받아 finalMessage()만 쓴다 (긴 출력에서 HTTP 타임아웃 회피)
src/main/llm/cliEnv.ts       # 두 CLI 공용 — 로그인 셸 조회·PATH, 실행 파일 탐색(후보 경로 → command -v)·버전, 빈 cwd(userData/llm)
src/main/llm/claudeCli.ts    # claude 실행 파일 탐색·spawn. 프롬프트는 stdin, 시스템 프롬프트는 --system-prompt
src/main/llm/codexCli.ts     # codex 실행 파일 탐색·모델 카탈로그(codex debug models)·spawn(codex exec). 프롬프트는 stdin, 답은 -o 파일
src/main/llm/openaiApi.ts    # OpenAI SDK Responses API. instructions=시스템 프롬프트, input=프롬프트, output_text만 쓴다
src/main/llm/apiKey.ts       # 회사별 API 키 저장·조회 (safeStorage 암호화)
src/main/llm/check.ts        # 설정 화면 "연결 확인" — 짧은 프롬프트 한 번
```

```ts
interface LlmCompleteParams {
  system: string
  prompt: string
  /** 생성 상한. local은 -n, 외부 API는 max_tokens의 하한(사고·추론 토큰이 포함되므로 16K 아래로 내리지 않는다) */
  maxTokens: number
  /** 임시 파일 이름과 로그에 쓰는 꼬리표 */
  label: string
  /** local이 프롬프트·출력 파일을 두는 폴더. 만들고 지우는 것은 호출하는 쪽(요약·용어 초안)의 몫 */
  workDir: string
  /** local 전용. GBNF 문법, 컨텍스트 크기, 온도. 외부 API 공급자는 무시한다 */
  grammar?: string
  contextTokens?: number
  temperature?: number
}

interface LlmClient {
  provider: LlmProvider
  /** 회의록 한 조각의 최대 글자 수. splitTranscript의 budgetChars로 넘긴다 */
  chunkBudgetChars: number
  /** 답변 본문만 돌려준다. llama의 `Assistant:` 표시 제거는 local 구현이 한다 */
  complete: (params: LlmCompleteParams) => Promise<string>
}
```

- `createLlmClient()`는 잡이 **시작할 때** 설정을 한 번 읽는다. 진행 중인 잡의 공급자는 바뀌지 않는다 (조용히 처리 옵션과 같은 규칙).
- 준비되지 않았으면 spawn·요청 전에 한국어 메시지로 멈춘다 (`llmMissingMessage`). 메시지는 renderer의 `SummarySection`도 같은 함수로 만들어 두 곳이 같은 문구를 보여준다.
- 외부 API를 써도 **잡 큐는 그대로 하나**다 (`pipeline/queue.ts`, 동시성 1). 외부 API는 GPU를 쓰지 않아 STT와 동시에 돌 수 있지만,
  큐를 둘로 나누면 "회의 처리 중이면 그 뒤에 만든다"는 화면 안내와 실패 처리가 공급자마다 갈린다. 단순함을 택했다.

### Claude Code CLI 호출

```
claude -p --output-format json --tools "" --no-session-persistence --setting-sources "" --system-prompt <system>
  (프롬프트는 stdin으로)
```

- **`--bare`를 쓰지 않는다.** 키체인 읽기를 끄기 때문에 구독 로그인이 풀려 "Not logged in"이 된다 (2026-09-24 실측). 대신
  `--tools ""`(도구 전부 끔), `--no-session-persistence`(세션 파일 남기지 않음), `--setting-sources ""`(사용자·프로젝트 설정 무시)로 최소 모드를 만든다.
- **`cwd`는 `userData/llm/`** 같은 빈 폴더로 둔다. 프로젝트 폴더에서 돌리면 그곳의 CLAUDE.md가 시스템 프롬프트에 섞인다.
- 프롬프트는 **stdin**으로 준다. 회의록은 수만 자라 argv에 넣을 수 없다 (llama와 같은 이유). 시스템 프롬프트는 수백 자라 `--system-prompt`로 넘긴다.
- 출력은 `--output-format json` 한 덩어리다. `type: 'result'`이고 `is_error`가 거짓일 때 `result` 문자열이 답변이다.
  `is_error`가 참이면 `result`가 오류 문장이다 (예: `Not logged in · Please run /login`) — 그대로 한국어 안내 뒤에 붙인다.
- **실행 파일 탐색**: Finder에서 띄운 Electron 앱의 `PATH`는 `/usr/bin:/bin:/usr/sbin:/sbin`뿐이라 `claude`가 안 잡힌다.
  `~/.local/bin/claude` → `/opt/homebrew/bin/claude` → `/usr/local/bin/claude` → `~/.claude/local/claude` 순서로 존재를 보고,
  없으면 로그인 셸(`$SHELL -ilc 'command -v claude'`)로 한 번 찾아 캐시한다. spawn할 때 `PATH`도 로그인 셸의 값으로 바꿔 준다
  (npm 설치본은 `node`를 PATH에서 찾는다). 결과(`path`·`version`)는 `llm:status`로 설정 화면에 보여준다.

### Codex CLI 호출 (2026-09-29)

```
codex exec --ephemeral --skip-git-repo-check --ignore-user-config --ignore-rules -s read-only
  -c developer_instructions=<시스템 프롬프트, TOML 문자열> -c model_reasoning_effort="low" [-m <모델>]
  -o <답변 파일> -
  (프롬프트는 stdin으로)
```

- **`--ignore-user-config`**: 사용자의 `~/.codex/config.toml`(MCP 서버·알림 훅·개인 지시)을 읽지 않는다. 인증은 그대로 `CODEX_HOME`에서 읽으므로 구독 로그인은 유지된다 (2026-09-29 실측).
  대신 사용자가 config에 적은 기본 모델도 무시되므로 "CLI 기본 모델"은 **CLI 내장 기본값**이다 — 화면 문구에 그렇게 적는다.
- **`--ephemeral`**(세션 파일 남기지 않음), **`--skip-git-repo-check`**(빈 cwd는 git 저장소가 아니다), **`-s read-only`**(요약에 쓰기 권한이 필요 없다), **`--ignore-rules`**.
- 시스템 프롬프트는 `-c developer_instructions=…`로 넘긴다. 값은 TOML로 파싱되므로 `JSON.stringify`한 문자열(TOML 기본 문자열과 호환)을 넣는다. Codex 자체 기본 지시문은 그대로 남는다.
- **답은 `-o <파일>`(마지막 메시지)로 받는다.** stdout에는 머리말·사용 토큰 같은 사람용 출력이 섞인다. 파일은 호출 쪽 `workDir`가 아니라 CLI 전용 임시 폴더에 두고 읽은 뒤 지운다.
- **실패하면 종료 코드 1**이고 stderr에 `ERROR: {"type":"error","status":400,"error":{"message":…}}` 줄이 남는다. 그 JSON의 `error.message`를 꺼내 한국어 안내 뒤에 붙이고, 없으면 stderr 마지막 줄을 붙인다.
- **실행 파일 탐색**: `~/.local/bin/codex` → `/opt/homebrew/bin/codex` → `/usr/local/bin/codex` → `/Applications/ChatGPT.app/Contents/Resources/codex`(ChatGPT 데스크탑 앱이 동봉) → `/Applications/Codex.app/Contents/Resources/codex` 순서, 없으면 로그인 셸 `command -v codex`. 탐색·PATH·버전 확인은 Claude Code와 같은 코드(`cliEnv.ts`)를 쓴다.
- **모델 카탈로그**는 `llm:status`마다 `codex debug models`로 읽는다(수십 ms). 파싱은 `unknown`으로 받아 `models[].slug`·`display_name`·`description`·`visibility`·`priority`만 좁혀 쓰고, 실패하면 빈 목록(= CLI 기본 모델만)으로 둔다.

### Claude API 호출

- `new Anthropic({ apiKey })` → `client.messages.stream({...}).finalMessage()`. 스트리밍은 화면에 흘리지 않고 타임아웃 회피용이다.
- `stop_reason === 'refusal'`이면 "요청을 처리하지 않았습니다"로, `max_tokens`면 "답변이 잘렸습니다"로 안내한다.
- 오류는 SDK의 타입으로 나눈다: `AuthenticationError`(키 오류) → `RateLimitError`(한도) → `APIConnectionError`(네트워크) → `APIError`(그 외, 상태 코드 포함).
- **API 키는 `safeStorage.encryptString`으로 암호화해 settings 테이블에 base64로 저장한다** (`llm.claudeApiKey`·`llm.openaiApiKey`). renderer에는 키를 돌려주지 않고
  회사별 유무와 마지막 4자(`apiKeys[vendor].isSaved`·`.tail`)만 준다. `safeStorage.isEncryptionAvailable()`이 거짓이면 저장을 거절한다 — 평문으로 남기지 않는다.

### OpenAI API 호출

- `new OpenAI({ apiKey })` → `client.responses.create({ model, instructions: system, input: prompt, max_output_tokens, reasoning: { effort: 'low' } })`.
  Chat Completions는 쓰지 않는다 — OpenAI가 Responses API를 기본 인터페이스로 안내한다. 응답은 `output_text`만 쓴다.
- `status === 'incomplete'`이면 `incomplete_details.reason`을 본다: `max_output_tokens`면 "답변이 잘렸습니다", `content_filter`면 "요청을 처리하지 않았습니다".
  Claude의 `stop_reason`과 같은 이유로 빈 요약·잘린 요약이 저장되지 않게 오류로 바꾼다.
- 오류는 SDK의 타입으로 나눈다: `AuthenticationError`(키 오류) → `RateLimitError`(한도·잔액) → `APIConnectionError`(네트워크) → `APIError`(그 외, 상태 코드 포함). Claude와 같은 순서·같은 문구 형식이다.
- 스트리밍은 쓰지 않는다. SDK 기본 타임아웃(10분)이 요약 한 번에 충분하다.

### IPC

| 키 | 채널 | 방향 | 용도 |
| --- | --- | --- | --- |
| `llm.status` | `llm:status` | invoke | `LlmStatus` 조회 — 공급자, 로컬 모델 준비 여부, 회사별 키 유무·꼬리, GPT 모델, `claude` 경로·버전 |
| `llm.setProvider` | `llm:setProvider` | invoke | 공급자 저장. 갱신된 `LlmStatus`를 돌려준다 |
| `llm.setApiKey` | `llm:setApiKey` | invoke | 회사(`vendor`)의 키 저장(`apiKey: string`) 또는 삭제(`null`). 갱신된 `LlmStatus`를 돌려준다 |
| `llm.setOpenaiModel` | `llm:setOpenaiModel` | invoke | GPT 모델 저장(`model: OpenaiModelId`). 갱신된 `LlmStatus`를 돌려준다 |
| `llm.setCodexModel` | `llm:setCodexModel` | invoke | Codex CLI 모델 저장(`model: string \| null`, null이면 CLI 기본 모델). id는 영숫자·`.`·`_`·`-` 64자 이하만 받는다. 갱신된 `LlmStatus`를 돌려준다 (2026-09-29) |
| `llm.check` | `llm:check` | invoke | 현재 공급자로 짧은 프롬프트 한 번. 성공 메시지를 돌려주고 실패는 reject |

- 공급자는 `AppSettings`에 넣지 않는다 — 키 저장·CLI 탐색·연결 확인 같은 비동기 동작이 붙어 있어 용어 사전과 같은 이유로 **자기 채널**을 쓴다 (`references/data-model.md`).
- `llm:check`는 큐를 거치지 않는다. 짧고, 로컬 공급자는 spawn 대신 모델 존재만 확인해 돌려준다.

### 화면

- `setting/LlmSection` — 설정의 **"요약 · 용어 초안"** 카테고리. 용도로 이름을 짓는다 — "언어 모델"은 음성 인식 모델과 겹쳐 들린다.
  "실행 방식" 라디오 네 개(제목·설명·전송 안내), 고른 방식에 따라 아래 행이 바뀐다:
  `local`이면 **로컬 요약 모델 파일** 다운로드 행(`model/SummaryModelSection`, 페이지가 `localModelSlot`으로 넘긴다),
  `claude-api`·`openai-api`면 그 회사의 API 키 입력(`type="password"`, 같은 `ApiKeyField`에 라벨·안내·자리표시자만 다르게)·저장·삭제와 저장 상태(`…abcd`),
  `openai-api`면 그 아래 GPT 모델 선택(`OpenaiModelSelect`, `<select>` 하나 — 셋 중 하나라 라디오를 또 쌓지 않는다),
  `claude-cli`면 찾은 경로·버전 또는 설치 안내.
  "연결 확인" 버튼은 외부 공급자에서만 보인다. 로컬 파일 행은 파일이라는 점을 제목에 드러내고, 외부 공급자를 쓰면 필요 없다고 설명에 적는다.
- `meeting/SummarySection`은 `useModelStatus` 대신 `useLlmStatus`로 준비 여부를 본다. 준비되지 않았을 때의 문구는 공급자별로 다르고(`llmMissingMessage`), 설정 링크는 같다.
  캡션 "로컬 모델"은 공급자 라벨로 바뀐다(위치는 헤더의 제목 아랫줄 — "화면별 구성"의 회의 상세).
- `setting/GlossarySection`의 "초안에는 요약 모델이 필요합니다" 안내는 공급자 라벨을 쓰도록 바꾼다 (그 위젯을 손대는 작업이 끝난 뒤).
