---
description: renderer 커스텀 훅(common / domain) 작성 가이드라인. shared/hooks 코드 생성·수정 전 필독.
paths:
  - "src/renderer/src/shared/hooks/**"
---

# React hook 가이드라인

## 핵심 개념

`@renderer/shared/hooks`의 커스텀 훅은 도메인 로직을 다루는 훅(**domain 훅**)과 다루지 않는 훅(**common 훅**)으로 나뉨.

- `useInterval`, `useKeyboardShortcut`, `useAudioLevel` → common 훅
- `useMeetings`, `useRecorder`, `usePipelineProgress` → domain 훅

특정 컴포넌트와 강결합된 훅은 `shared/hooks`에 두지 않고 해당 컴포넌트 폴더의 `model`에 코로케이션. **훅의 위치는 사용 횟수("지금은 여기서만 쓴다")가 아니라 컴포넌트와의 강결합 여부로 판단**하며, 세부 기준은 `.claude/rules/segment-pattern.md` 참고. 덕분에 재사용 가능한 훅을 찾을 때는 `shared/hooks`만 확인하면 됨.

`window.api`를 직접 호출하는 훅은 없음. 훅은 `@renderer/shared/api/*`의 요청 함수만 사용 (`.claude/rules/ipc-api-guide.md`).

## 훅 파일 구조

훅 이름과 동일한 디렉토리를 만들고 그 안에 `index.ts`로 작성. 훅은 화살표 함수 + `export default`, 인자는 `함수명 + Params` interface, 반환은 객체.

```
src/renderer/src/shared/hooks/
├── common/
│   ├── useInterval/index.ts
│   └── useAudioLevel/index.ts
└── domain/
    ├── meeting/
    │   ├── useMeetings/index.ts
    │   └── useMeeting/index.ts
    ├── recording/
    │   └── useRecorder/index.ts
    └── pipeline/
        └── usePipelineProgress/index.ts
```

## domain 훅

도메인 로직을 다루되 특정 컴포넌트에 강결합되지 않은 훅. 도메인이 겹치는 상황에서는 컴포넌트 재사용 대신 도메인 로직을 훅으로 만들어 `shared/hooks/domain`으로 내려서 재사용.

domain 훅은 common 훅에 도메인만 붙인 형태 (`useAudioLevel` + recording 도메인 → `useRecorder`). `src/renderer/src/shared/hooks/domain/` 아래 **도메인별 디렉토리로 묶어서** 작성. 도메인 이름은 `.claude/rules/project-structure.md`의 도메인 목록 사용.

### 데이터 요청 훅 (템플릿)

서버 상태 라이브러리를 쓰지 않으므로 요청 상태는 훅 안에서 직접 관리. 반환값은 도메인 개념(`meetings`, `isLoading`, `error`, `refetch`)만 담고, 특정 JSX용 props 묶음은 반환하지 않음.

**첫 로드용 요청 함수는 `async/await`가 아니라 프로미스 체인으로 작성.** `react-hooks/set-state-in-effect`(eslint-plugin-react-hooks 7의 컴파일러 규칙)는 `await` 뒤의 `setState`도 effect 안의 동기 호출로 보기 때문에, effect에서 호출하는 `async` 함수는 린트에 걸림. `.then`/`.catch`/`.finally` 콜백 안의 `setState`는 통과.
같은 이유로 `isLoading`을 다시 켜는 일은 요청 함수가 아니라 **사용자 액션에서 호출하는 `refetch`** 가 맡음 (첫 로드는 초기값 `true`로 충분).

```ts
// src/renderer/src/shared/hooks/domain/meeting/useMeetings/index.ts
import { useCallback, useEffect, useState } from 'react'
import type { Meeting } from '@shared/types'
import { getMeetingsApi } from '@renderer/shared/api/meetings'

const useMeetings = () => {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchMeetings = useCallback(
    () =>
      getMeetingsApi()
        .then((next) => {
          setMeetings(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error('회의 목록을 불러오지 못했습니다'))
        )
        .finally(() => setIsLoading(false)),
    []
  )

  /** 사용자가 다시 시도할 때만 로딩 상태를 다시 켠다 */
  const refetch = useCallback(() => {
    setIsLoading(true)

    return fetchMeetings()
  }, [fetchMeetings])

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  return { meetings, isLoading, error, refetch }
}

export default useMeetings
```

### 이벤트 구독 훅 (템플릿)

main → renderer push 이벤트(진행률, 다운로드 상태)는 `useEffect` 안에서 구독하고 **반드시 cleanup**으로 해제.

```ts
// src/renderer/src/shared/hooks/domain/pipeline/usePipelineProgress/index.ts
import { useEffect, useState } from 'react'
import type { PipelineProgressEvent } from '@shared/ipc'
import { onPipelineProgress } from '@renderer/shared/api/events'

interface UsePipelineProgressParams {
  meetingId: string
}

const usePipelineProgress = ({ meetingId }: UsePipelineProgressParams) => {
  const [progress, setProgress] = useState<PipelineProgressEvent | null>(null)

  useEffect(() => {
    const unsubscribe = onPipelineProgress((event) => {
      if (event.meetingId === meetingId) setProgress(event)
    })
    return unsubscribe
  }, [meetingId])

  return { stage: progress?.stage ?? 'idle', percent: progress?.percent ?? 0 }
}

export default usePipelineProgress
```

## checklist

- [ ] 훅 이름과 동일한 디렉토리 안에 `index.ts`로 작성
- [ ] 도메인 로직을 다루면 domain 훅, 아니면 common 훅으로 분류
- [ ] domain 훅은 `shared/hooks/domain/{도메인}/`에 배치
- [ ] 특정 컴포넌트와 강결합된 훅은 `shared/hooks`가 아니라 해당 컴포넌트 폴더의 `model`에 코로케이션
- [ ] `window.api`를 직접 호출하지 않고 `@renderer/shared/api/*` 요청 함수 사용
- [ ] 구독·타이머·`AudioContext`는 cleanup 반환
- [ ] 객체 반환, 인자는 `Params` interface
- [ ] 훅 자체는 테스트하지 않음 (컴포넌트 통합 테스트로 검증, `.claude/rules/test-strategy.md`)
