---
paths:
  - "apps/desktop/src/**/*.test.ts"
  - "apps/desktop/src/**/*.test.tsx"
  - "apps/desktop/src/**/test.ts"
  - "apps/desktop/src/**/test.tsx"
  - "apps/desktop/src/renderer/src/__test__/**"
  - "apps/web/src/**/*.test.ts"
  - "packages/*/src/**/*.test.ts"
description: vitest 기반 단위·통합 테스트의 위치와 대상, 모킹 지점을 정의하는 테스트 전략. 테스트 코드 작성·배치 전 필독.
---

# 테스트 전략 가이드라인

테스트 러너는 **vitest**. 루트 `pnpm test`는 `pnpm -r run test`로 모든 워크스페이스의 테스트를 돌리고, 워치는 워크스페이스에서 (`pnpm --filter meeting-stt run test:watch`). 테스트는 **구현 코드와 같은 워크스페이스**에 둔다 — 공용 로직을 `packages/core`로 옮기면 그 테스트도 함께 옮긴다 (`references/monorepo.md`). UI 스냅샷·스토리북은 보류하고, **단위·통합 두 가지**를 가져감. E2E(Electron 실행)는 Phase 4에서 검토.

AI로 기능 개발 시 검증 루프가 필요한데, 검증 루프를 테스트 코드로 만들어 두면 개발 효율이 좋아짐. 기능 구현 시 테스트 코드를 검증 루프로 활용할 것. 특히 병합 알고리즘·포맷터 같은 순수 로직은 **테스트를 먼저 쓰고** 구현.

## 테스트 종류별 위치와 대상

| 종류 | 위치 | 대상 | 도구 |
| --- | --- | --- | --- |
| 단위 테스트 (공용 패키지) | 구현 파일 옆 `*.test.ts` (`packages/core/src/merge.ts` + `merge.test.ts`) | 두 앱이 함께 쓰는 순수 함수: 화자 배정·병합, 타임스탬프·복사 포맷, 정규화 공식, 참석자 수 검증 | vitest (node 환경) |
| 단위 테스트 (프로세스 공용·main) | 구현 파일 옆 `*.test.ts` (`src/shared/progress.ts` + `progress.test.ts`, `src/main/pipeline/whisper.ts` + `whisper.test.ts`) | 앱 전용 순수 함수: 진행률 가중치, whisper JSON 파싱, WAV 헤더 계산, 요약 프롬프트 조립 | vitest (node 환경) |
| 단위 테스트 (renderer) | 세그먼트 `utils`는 `utils/groupBySpeaker.ts` + `utils/groupBySpeaker.test.ts`, `shared/utils`는 `formatDuration/index.ts` + `formatDuration/test.ts` | 유틸 함수 | vitest (node 환경) |
| 통합 테스트 | 최종 책임 컴포넌트(대부분 widgets) 폴더 안의 `test.tsx` | 요청부터 UI까지 하나의 유저 플로우 전체 | vitest + `@testing-library/react` + `happy-dom` (widgets 첫 작성 시 도입, `test.tsx` 상단에 `// @vitest-environment happy-dom`) |
| E2E | `src/renderer/src/__test__/{page}.test.ts` | 페이지 단위 | 보류 (Phase 4에서 Playwright Electron 검토) |

## 배치 규칙

- 테스트 파일은 "인덱스 제외 나머지는 폴더로 둔다"는 네이밍 규칙의 예외. 세그먼트 `utils`와 Node 쪽(`packages/*/src`, `src/shared`, `src/main`)의 단위 테스트는 `{구현체 이름}.test.ts`, renderer `shared/utils`의 단위 테스트는 폴더 안 `test.ts`, JSX를 렌더링하는 컴포넌트 통합 테스트는 컴포넌트 폴더 바로 아래 `test.tsx`.
- **훅은 테스트하지 않음.** 단위 테스트 대상은 순수 함수이며, 훅의 동작은 해당 컴포넌트의 통합 테스트로 검증.
- E2E 테스트를 페이지 폴더에 두지 않음. 도입 시 전역 `__test__/`로 분리.
- 스토리북·스냅샷 파일(`*.stories.tsx`, `__snapshots__`)은 보류 상태이므로 새로 만들지 않음.

## 모킹 지점

- renderer 통합 테스트에서 IPC는 **`@renderer/shared/api/{domain}` 모듈만** 모킹 (`vi.mock`). `window.api`나 `ipcRenderer`를 직접 모킹하지 않음 — 이것이 api 래퍼를 한 겹 두는 이유 중 하나.
- main 단위 테스트에서 외부 바이너리는 실행하지 않음. `spawn` 래퍼(`src/main/bin/spawn.ts`)를 모킹하고, whisper/sherpa 출력은 `src/main/pipeline/fixtures/`에 커밋해 둔 **실제 출력 샘플**을 입력으로 사용 (직접 지어낸 문자열 금지 — 인코딩·타임스탬프 함정이 재현되지 않음). 샘플은 짧게 잘라 두고, 바이너리 버전을 파일 상단 주석이나 파일명에 남김. 이 폴더는 `.prettierignore`에 넣어 둠 — whisper 샘플은 유효한 UTF-8이 아니라 prettier가 다시 쓰면 내용이 깨진다.
- 실제 오디오·모델 파일이 필요한 검증은 테스트가 아니라 `scripts/`의 Phase 1 검증 스크립트로 수행.
- **`src/main/db/*`는 단위 테스트 대상이 아니다.** `better-sqlite3`는 `electron-builder install-app-deps`가 Electron ABI로 리빌드하므로
  순수 Node에서 도는 vitest가 import하면 `NODE_MODULE_VERSION` 오류로 죽는다 (`references/pitfalls.md`). DB 동작은 `pnpm dev`로 확인.
- 같은 이유로 `electron` 모듈을 import하는 파일(`src/main/index.ts`, `ipc/handlers.ts`, 경로 해석 모듈)도 테스트에서 import하지 않는다.
  테스트가 필요한 로직은 electron 의존이 없는 순수 함수로 분리해 둔다.

## 작성 규칙

- 테스트 이름은 한국어로 동작을 서술 (`it('같은 화자의 연속 발화를 하나로 합친다', ...)`).
- 사용자에게 보이는 동작을 검증. 내부 상태·구현 세부를 검증하지 않음 (`screen.getByText`, `getByRole` 우선).
- 테스트는 독립적. 공유 상태 없이 각 테스트에서 데이터를 만듦.
- 반드시 다루는 엣지 케이스: 빈 배열(발화 없음), 경계 시간(0초, 겹치는 구간), 단일 화자, 화자 라벨 누락, 바이너리 비정상 종료·JSON 파싱 실패.
- vitest 기본 수집 패턴은 `*.test.ts`만 맞고 폴더 안 `test.ts` / `test.tsx`는 맞지 않음. **`vitest.config.ts`는 워크스페이스마다 하나**이며(`apps/desktop`, `apps/web`, `packages/*`), `include: ['src/**/*.test.{ts,tsx}', 'src/**/test.{ts,tsx}']`와 그 워크스페이스의 경로 별칭(데스크탑은 `@shared`·`@renderer`)을 설정한다 (electron-vite 설정은 vitest가 읽지 않음). 새 패키지를 만들면 `test` 스크립트를 반드시 넣는다 — 없으면 `pnpm -r run test`가 조용히 건너뛴다.

```ts
// packages/core/src/merge.test.ts
import { describe, expect, it } from 'vitest'
import { mergeUtterances } from './merge'

describe('mergeUtterances', () => {
  it('같은 화자의 연속 발화를 하나로 합친다', () => {
    const merged = mergeUtterances([
      { speaker: 'SPEAKER_00', start: 0, end: 1.2, text: '안녕하세요' },
      { speaker: 'SPEAKER_00', start: 1.3, end: 2.5, text: '회의 시작하겠습니다' }
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].text).toBe('안녕하세요 회의 시작하겠습니다')
  })

  it('발화가 없으면 빈 배열을 반환한다', () => {
    expect(mergeUtterances([])).toEqual([])
  })
})
```
