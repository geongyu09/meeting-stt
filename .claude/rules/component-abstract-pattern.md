---
paths:
  - "src/renderer/src/pages/**"
  - "src/renderer/src/modules/**"
  - "src/renderer/src/shared/components/**"
description: renderer React 컴포넌트가 지켜야 하는 추상화 레벨(pages > widgets > features > composites > primitives)을 정의한 가이드라인. 컴포넌트 생성·수정·리팩토링·코드리뷰 전 필독.
---

# 리액트 컴포넌트 추상화 가이드라인

이 문서는 renderer의 모든 컴포넌트가 지켜야 하는 추상화 레벨을 정의함.
**컴포넌트를 어느 위치에 둘 것인가**만 다루며, 위치가 정해진 이후는 아래 문서 참고.

- `.claude/rules/component-colocation-pattern.md` : 컴포넌트 폴더를 어떻게 구성할 것인가
- `.claude/rules/segment-pattern.md` : 컴포넌트 폴더 내부 세그먼트(`ui` / `model` / `utils` / `types` / `constants` / `context`)를 어떻게 나누고 어디에 둘 것인가

## 핵심 원칙

모든 컴포넌트는 **도메인 로직을 다루는지**에 따라 `modules/...` 또는 `shared/components/...`에 들어감.
여기서 도메인 로직이란 `window.api` 요청(→ `@renderer/shared/api`), 도메인 훅, 도메인 타입(`Meeting`, `Utterance`, `Speaker`)을 아는 것을 말함.

- `shared/components/`는 내부 UI 로직 유무에 따라 `composites` / `primitives`로 나뉨.
- `modules/`는 section 단위의 큰 구획(`widgets`)과 섹션이 되지 못하는 작은 도메인 단위(`features`)로 나뉨.

### 컴포넌트 종류

| 레벨 | 위치 | 도메인 로직 | UI 로직 | 예시 |
| --- | --- | --- | --- | --- |
| widgets | `modules/widgets/{domain}/` | O | O | `MeetingListSection`, `TranscriptSection`, `RecorderSection`, `ModelDownloadSection` |
| features | `modules/features/{domain}/` | O | O | `RecordButton`, `SpeakerRenameField`, `CopyTranscriptButton`, `UtteranceEditor` |
| composites | `shared/components/composites/` | X | O | `InlineEditableText`, `Tabs`, `ConfirmDialog`, `SwitchCase` |
| primitives | `shared/components/primitives/{ui,layout,animation}/` | X | X | `Button`, `TextField`, `LevelMeter`, `ProgressBar`, `Flex`, `FadeIn` |

- `modules/widgets` : `<section />`으로 분류할 수 있을 만큼 규모가 큰, 화면의 독립적인 구획. 도메인 로직을 포함하며 페이지에서 import되어 사용되고 **여러 page에서 재사용 가능**. 섹션 단위의 유저 플로우 전체를 책임짐.
- `modules/features` : widgets 내부에서 독립적으로 존재할 수 있는, 섹션이 되지 못하는 작은 단위의 도메인 컴포넌트. 여러 widgets·pages에서 재사용될 수 있으며, 할당받은 완결된 작업(녹음 시작, 화자 이름 저장, 복사)을 스스로 수행.
- `shared/components/composites` : 공통 UI와 내부(UI) 로직을 다룸. 도메인 로직은 다루지 않음.
- `shared/components/primitives` : 공통 UI만 다룸.

### widgets vs features 판단 기준

**공통점**: 둘 다 도메인 로직을 가지며, 내부에 API 요청까지 갖추고 혼자서도 동작하는 독립적인 단위이므로 `index.tsx` 기준 props가 거의 없어야 함. (라우트 파라미터인 `meetingId` 정도만 허용)

**판단 순서** (두 단계):

1. **섹션 단위인가?** `<section />`으로 묶일 만큼 큰 구획이면 widgets. 대체로 섹션의 제목이 H2이므로, Heading(H2)이 있으면 무조건 widgets, 없으면 widgets이 아닐 가능성이 높음.
2. **1번으로 애매하다면, widgets 안에서 재사용될 수 있는가?** 재사용 가능하면 features, 아니면 widgets.

두 단계로도 모든 UI를 나눌 수는 없으므로, 애매한 케이스는 사용자에게 확인.

**부모 데이터에 의존하는 서브 컴포넌트는 features가 아님.** `MeetingListSection`이 목록을 요청해 각 항목을 `<MeetingCard meeting={m} />`로 그린다면, `MeetingCard`는 스스로 동작하지 못하므로 features가 아니라 `MeetingListSection/ui/MeetingCard.tsx`에 둠.

### 참조 규칙

- 각 컴포넌트는 `pages` > `widgets` > `features` > `composites` > `primitives` 순서의 레벨을 가지며, **자신보다 하위 레벨만 사용 가능**. 상위 레벨 컴포넌트는 사용 불가.
  - `pages` : widgets를 배치·조립하는 레이아웃 역할만 담당. UI 단위가 크지 않은 경우(예: 온보딩의 단일 버튼)에는 features를 바로 사용 가능.
  - `widgets` : features·composites·primitives를 조합 가능.
  - `features` : composites·primitives만 조합 가능. **widgets는 사용 불가.**
  - `composites` : primitives만 조합 가능.
  - `primitives` : 상위 레벨을 사용할 수 없음.
- **동일 레벨끼리의 조합은 `primitives`에서만 허용.**
  - widgets는 widgets를 호출할 수 없음. `<section />` 안에 `<section />`이 호출되는 구조가 어색하기 때문.
  - features가 features를 호출하면 도메인이 섞이므로 금지.
  - composites끼리도 조합 불가. 공통 UI가 겹치면 primitives로 내려서 재사용.
  - primitives끼리 조합한 결과는 primitives로 둠.
- 도메인이 겹치는 상황에서는 컴포넌트 재사용 대신, 도메인 로직을 훅으로 만들어 `shared/hooks/domain`으로 내려서 재사용.
- `window.api`는 어느 레벨에서도 직접 호출하지 않음. widgets·features는 `@renderer/shared/api/*` 요청 함수 또는 `shared/hooks/domain` 훅을 통해서만 데이터를 다룸.

### 주의사항

- 라우트에 대응하는 화면 단위는 `src/renderer/src/pages`에 두며, widgets를 import해 **배치하는 레이아웃 역할만** 담당. 도메인 로직·데이터 요청은 갖지 않음.
- 하나의 페이지를 보여주는 컴포넌트는 `modules/`, `shared/components/`에 두지 않음. 페이지 컴포넌트는 이 문서의 추상화 규칙을 따르지 않음.

#### modules/widgets

- 도메인 로직을 다루는 컴포넌트. section 단위의 큰 컴포넌트로, 여러 page에서 재사용 가능
- 데이터 요청 같은 로직을 수행하면서 하위 요소에 책임을 할당하는 지휘자 역할
- 요청과 데이터, 액션 핸들러는 해당 컴포넌트가 직접 책임지되, 책임이 너무 많아지면 `useXxx` 훅으로 책임별로 묶어 컴포넌트 폴더의 `model`에 코로케이션
- 하위에 도메인별 디렉토리로 작성 (`meeting/TranscriptSection`, `recording/RecorderSection`). `Section` 접미사 여부는 자율

#### modules/features

- 도메인 로직(api 요청, `shared/hooks/domain/...`)을 다루는 컴포넌트
- widgets와 마찬가지로 자신에게 필요한 데이터를 **직접 요청**. 요청·핸들러 책임이 많아지면 `useXxx` 훅으로 묶어 `model`에 코로케이션
  - 같은 데이터를 widgets와 features가 함께 쓰는 경우에도 props로 내리지 않고, 각자 `shared/hooks/domain` 훅을 호출. 요청이 중복되어 문제가 되면 그 도메인의 훅에 캐시를 두거나 `shared/provider`의 컨텍스트로 올림 (컴포넌트 간 props 전달로 해결하지 않음)
- 섹션이 되지 못하는 작은 단위로, 여러 widgets·pages에서 재사용 가능한 단위로 작성
- 하위에 도메인별 디렉토리로 작성 (`recording/RecordButton`, `speaker/SpeakerRenameField`)
- 여러 도메인에 걸치는 공통 컴포넌트는 UI와 화면 전환 정도만 가지면 composites, 도메인 로직을 가지면 features로 분류

#### shared/components/composites

- 도메인을 다루지 않는 컴포넌트. 내부 로직(UI 로직)까지만 다룸
- 탭·인라인 편집 같은 UI는 상태 끌어올리기를 하지 않고, 컴파운드 패턴이나 FACC 패턴으로 composites 컴포넌트 자체가 상태와 UI 로직을 갖도록 함
- 예: `InlineEditableText`(편집 모드 진입·blur/Enter 확정·Esc 취소만 담당, 저장은 `onCommit`으로 위임), `Tabs`, `ConfirmDialog`, `SwitchCase`

#### shared/components/primitives

- 내부 로직 및 도메인 로직을 다루지 않는 컴포넌트. UI만 다루며, primitives끼리 조합한 결과도 primitives로 둠
- 종류에 따라 `ui`, `layout`, `animation`으로 나뉨
  - `ui` : 색상이나 모형 등 실체가 있는 컴포넌트 — `Button`, `TextField`, `LevelMeter`(level 값을 받아 그리기만), `ProgressBar`, `Badge`
  - `layout` : 특정 요소를 위치시키는 컴포넌트 — `Flex`, `Stack`, `Space`
  - `animation` : 특정 요소의 애니메이션을 다루는 컴포넌트 — `FadeIn`, `Slide`

## 컴포넌트 구현하기

### 절차

1. **도메인 로직 확인하기** — 회의록 발화 편집 컴포넌트를 만든다면 도메인은 `utterance`.
2. **추상화 레벨에 맞추어 구현 계획 세우기**

   - 발화 목록 전체를 보여주고 편집·화자 재배정을 지휘하는 **회의록 섹션** → `modules/widgets/meeting/TranscriptSection`
   - 발화 하나의 텍스트를 편집하고 저장 API를 호출하는 **발화 편집기** → `modules/features/utterance/UtteranceEditor`
   - 클릭하면 편집 모드로 바뀌고 blur 시 확정하는 **인라인 편집 텍스트** → `shared/components/composites/InlineEditableText`
   - 인라인 편집에서 쓰는 **텍스트 영역, 버튼** → `shared/components/primitives/ui`

3. **구현하기** — 하위 레벨부터 만들고 상위에서 조립. 새 컴포넌트를 만들기 전에 같은 레벨에 이미 있는 컴포넌트를 먼저 확인.

---

**기억할 것**: 이 문서의 추상화 규칙 외의 불필요한 추상화는 절대 금지. 한 곳에서만 쓰이는 3줄짜리 JSX를 위해 primitives를 만들지 않음.
