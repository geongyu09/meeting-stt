---
paths:
  - "apps/desktop/src/renderer/src/pages/**"
  - "apps/desktop/src/renderer/src/modules/**"
  - "apps/desktop/src/renderer/src/shared/components/**"
description: renderer React 컴포넌트가 지켜야 하는 폴더/index.tsx 방식의 콜로케이션 패턴 가이드라인. 컴포넌트 생성·수정·리팩토링·코드리뷰 전 필독.
---

# 컴포넌트 콜로케이션 패턴 가이드라인

## 핵심 원칙

모든 컴포넌트는 추상화 레벨과 무관하게 아래의 콜로케이션 패턴을 지켜야 함.
각 컴포넌트는 자신의 폴더를 가지며, 해당 폴더 내 `index.tsx` 파일을 통해 익스포트됨.

컴포넌트에서 사용되는 서브 컴포넌트, 상태 로직, 유틸, 타입, 상수 등은 모두 해당 컴포넌트 폴더 내에 위치해야 함.
`index.tsx`에서 컴포넌트의 메인 구현을 익스포트하며, 다른 파일들은 컴포넌트 내부에서만 사용.

코로케이션의 목적은 **응집도**. 같이 변하는 코드를 함께 묶어두면 해당 위치의 코드를 1개의 이유로만 수정하게 되고, 내부 로직 수정 시 영향 범위를 폴더 구조만 보고도 알 수 있음.

### 세그먼트

컴포넌트 폴더 내부는 `ui` / `model` / `utils` / `types` / `constants` 세그먼트로 나누며, 필요 시 `context`를 선택적으로 추가.
`api`는 세그먼트가 아니므로 컴포넌트 폴더에 두지 않음. `window.api` 래퍼는 `@renderer/shared/api`에서만 관리.

세그먼트는 컴포넌트 폴더 내부를 역할별로 나누는 구획이며, renderer `shared` 최상위 폴더 구성(`components`, `hooks`, `provider`, `routes` 등)과는 별개 개념. **각 세그먼트의 정의와 판단 기준·의존 규칙은 `.claude/rules/segment-pattern.md` 참고.**
`hooks` 폴더는 `shared` 전용이므로 컴포넌트 폴더 내부에는 만들지 않고, 해당 컴포넌트에 강결합된 훅은 `model`에 둠.

### 네이밍 규칙

- 컴포넌트 폴더명은 구현체 이름으로 짓고, 구현체 파일은 `index.tsx`로 통일 (`Button/index.tsx`).
- 네이밍은 카멜(파스칼 포함)로 통일 (`meeting`, `TranscriptSection`).
- 폴더 + `index.tsx` 형태는 컴포넌트 폴더 자체에만 적용. **세그먼트 내부에서는 폴더 + `index.ts`를 다시 쓰지 않고 구현체 이름의 플랫 파일로 둠.**
  - 서브 컴포넌트·훅·유틸은 세그먼트 폴더 바로 아래의 플랫 파일 (`ui/UtteranceRow.tsx`, `model/useTranscript.ts`, `utils/groupBySpeaker.ts`).
  - 타입 파일은 항상 `types/` 폴더 안에 `types/transcript.ts`처럼 내용을 나타내는 이름으로 작성.
  - 통합 테스트(`test.tsx`)는 세그먼트 밖, 컴포넌트 폴더 바로 아래의 일반 파일. 단위 테스트는 `utils/groupBySpeaker.test.ts`처럼 구현 파일 옆에 둠.

### 폴더 구조 예시

동일한 폴더 구성 규칙이 `modules/widgets`, `modules/features`, `shared/components/composites`에 그대로 적용됨. `primitives`와 페이지 컴포넌트는 세그먼트를 강제하지 않되, 필요해지면 동일한 규칙을 그대로 적용.

> `primitives` 하위의 `ui` / `layout` / `animation`은 `.claude/rules/component-abstract-pattern.md`가 정의한 **컴포넌트 분류**이며, 컴포넌트 폴더 내부의 **세그먼트**와는 다른 개념.

```plaintext
src/renderer/src/
├── modules/
│   ├── widgets/
│   │   └── meeting/
│   │       └── TranscriptSection/
│   │           ├── index.tsx                   # 페이지에서 조립되는 section 컴포넌트
│   │           ├── ui/
│   │           │   ├── UtteranceRow.tsx        # 이 섹션 전용 서브 컴포넌트
│   │           │   ├── LoadingFallback.tsx
│   │           │   └── ErrorFallback.tsx
│   │           ├── model/
│   │           │   └── useTranscript.ts        # 이 섹션에 강결합된 훅
│   │           ├── context/
│   │           │   └── transcriptContext.tsx   # (선택) 이 섹션 전용 컨텍스트
│   │           ├── utils/
│   │           │   ├── groupBySpeaker.ts
│   │           │   └── groupBySpeaker.test.ts  # 단위 테스트
│   │           ├── types/
│   │           │   └── transcript.ts
│   │           └── test.tsx                    # 통합 테스트 (요청부터 UI까지 유저 플로우 전체)
│   └── features/
│       └── recording/
│           └── RecordButton/
│               ├── index.tsx                   # 도메인 컴포넌트 구현
│               ├── model/
│               │   └── useRecordButton.ts      # 녹음 시작/정지 상태 전환
│               └── constants/
│                   └── labels.ts
└── shared/
    └── components/
        ├── composites/
        │   └── InlineEditableText/
        │       ├── index.tsx                   # UI 로직을 포함한 공통 컴포넌트
        │       ├── ui/
        │       │   └── EditableTextarea.tsx
        │       └── model/
        │           └── useInlineEdit.ts
        └── primitives/
            └── ui/                             # primitives의 컴포넌트 분류 (세그먼트 아님)
                ├── Button/
                │   ├── index.tsx
                │   ├── types/
                │   │   └── button.ts
                │   └── constants/
                │       └── button.ts
                └── LevelMeter/
                    └── index.tsx
```

### 주의사항

- 각 컴포넌트는 자신의 폴더를 가져야 함. `modules/*`, `shared/components/*` 폴더 내에 컴포넌트 파일이 직접 위치하지 않도록 함. (단, `ui` 세그먼트 안의 서브 컴포넌트는 폴더 없이 플랫 파일로 둠)
- 컴포넌트 폴더 내에 `index.tsx` 파일이 반드시 존재해야 하며, 이 파일에서 컴포넌트의 메인을 구현.
- 컴포넌트 관련 모든 파일은 반드시 해당 컴포넌트 폴더의 세그먼트 내에 위치. (예외: 통합 테스트 `test.tsx`는 세그먼트 밖, 컴포넌트 폴더 바로 아래)
- 컴포넌트 폴더 내에서만 사용되는 파일들은 외부에서 임포트되지 않도록 주의. 외부에 공개하는 것은 `index.tsx`뿐.
- `ui/` 내부의 서브 컴포넌트도 **부모 컴포넌트의 추상화 레벨 규칙을 그대로 따름**. `primitives`의 서브 컴포넌트는 `composites`·`features`·`widgets`를 사용할 수 없음.
- 컨텍스트로 강하게 결합된 하위 컴포넌트(예: `TranscriptSection` 안의 `UtteranceRow`)는 밖에서 재사용될 수 없으므로 상위 컴포넌트의 `ui` 폴더 안에 코로케이션.
- **훅의 위치는 사용 횟수("지금은 여기서만 쓴다")로 판단하지 않음.** 컴포넌트와 강결합된 훅(컴포넌트의 렌더 구조·Context·로컬 state에 구조적으로 묶인 훅)만 `model`에 코로케이션하고, 도메인 값만 주고받는 훅은 지금 한 곳에서만 쓰이더라도 `shared/hooks/domain/<도메인>`에 둠. 세부 기준은 `.claude/rules/segment-pattern.md` 참고.
  - 강결합된 로직이더라도 도메인과 무관한 UI 로직이면 `shared/components/composites/{Component}/model`에 둠 (`Tabs/model/useTabContext`).
- 특정 컴포넌트에서만 쓰이는 컨텍스트(컴파운드 패턴, prop drilling 제거용)는 `shared/provider`가 아니라 해당 컴포넌트 폴더의 `context` 세그먼트에 코로케이션. `createContext`, `useContext`, `Provider` 세 가지는 파편화를 막기 위해 한 파일 안에 함께 작성하며, Provider가 JSX를 반환하므로 `context/transcriptContext.tsx`처럼 `.tsx` 파일로 둠.
- widgets, features 컴포넌트 세그먼트에서 사용되는 코드는 다른 도메인 컴포넌트에서 사용하지 않음.
  - 중복 로직이 필요할 때는 먼저 `.claude/rules/segment-pattern.md`의 훅 위치 판단 기준(이름·인자·반환값·다른 화면 이식 테스트)으로 판단.
    - 도메인 값만 주고받아 다른 화면에 이식 가능한 로직이면 훅으로 만들어 `shared/hooks/domain`으로 내려서 재사용.
    - 컴포넌트의 렌더 구조·Context·로컬 state에 묶여 이식 불가한 코드면 재사용하지 않고 동일한 코드를 각 도메인 컴포넌트에 코로케이션.
- 하나의 페이지를 렌더링하는 컴포넌트는 추상화 규칙의 대상은 아니지만, 폴더/`index.tsx` 콜로케이션 규칙은 동일하게 지킴 (`pages/Home/index.tsx`).
- 통합 테스트는 최종 책임 컴포넌트(대부분 widgets) 폴더 안에 `test.tsx`로 코로케이션, 단위 테스트는 `utils` 세그먼트 안에 구현 파일과 `*.test.ts`를 나란히 코로케이션. 훅은 테스트하지 않음.

#### index.tsx

- 컴포넌트의 메인 구현 파일
- 컴포넌트의 props 타입(`XxxProps` interface) 정의
- 컴포넌트 내부에서 사용되는 서브 컴포넌트, 훅, 유틸 함수 임포트
- 컴포넌트 렌더링 로직 구현

```tsx
// src/renderer/src/modules/features/recording/RecordButton/index.tsx
import Button from '@renderer/shared/components/primitives/ui/Button'

import useRecordButton from './model/useRecordButton'
import { RECORD_LABELS } from './constants/labels'

export default function RecordButton() {
  const { isRecording, toggle } = useRecordButton()

  return (
    <Button onClick={toggle} aria-pressed={isRecording}>
      {isRecording ? RECORD_LABELS.stop : RECORD_LABELS.start}
    </Button>
  )
}
```

#### 컴포넌트 폴더에서의 세그먼트

세그먼트 자체의 정의는 `.claude/rules/segment-pattern.md`를 따르며, 컴포넌트 폴더에서는 아래가 추가로 적용됨.

- 모든 세그먼트의 내용물은 **해당 컴포넌트 내부에서만 사용**. 외부에 공개하는 것은 `index.tsx`뿐.
- 컴포넌트 폴더에는 `api` 세그먼트를 두지 않음. `window.api` 래퍼는 컴포넌트 폴더가 아니라 `@renderer/shared/api/{domain}`에서 계층적으로 관리.
