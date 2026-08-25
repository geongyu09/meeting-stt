---
description: IPC 채널·payload 타입(src/shared/ipc.ts), main 핸들러, preload window.api 노출, renderer api 래퍼(@renderer/shared/api) 작성 규칙. IPC·API 코드 작성 전 필독.
paths:
  - "src/shared/ipc.ts"
  - "src/main/ipc/**"
  - "src/preload/**"
  - "src/renderer/src/shared/api/**"
---

# IPC · API 가이드라인

이 프로젝트에는 HTTP 서버가 없음. renderer의 "API"는 preload가 노출한 `window.api`이며, 실체는 main 프로세스의 IPC 핸들러. 네 층이 한 채널을 공유하므로 **채널과 타입은 한 곳(`src/shared/ipc.ts`)에서만 정의**하고 나머지는 그것을 import함.

```
renderer 컴포넌트/훅
  → @renderer/shared/api/{domain}   (window.api 래퍼, 유일한 window.api 접점)
  → window.api.{domain}.{action}    (preload, contextBridge)
  → ipcRenderer.invoke(channel)
  → ipcMain.handle(channel)         (src/main/ipc/handlers.ts)
  → src/main/{db,pipeline,models}   (실제 작업)
```

## 1. `src/shared/ipc.ts` — 채널과 타입의 단일 정의

- 채널 상수는 `IPC` 객체 하나에 도메인별로 묶고 `as const`. 문자열은 `'{domain}:{action}'` 형식.
- 요청/응답 타입은 `{동작}{리소스}Request` / `{동작}{리소스}Response` 접미, push 이벤트 payload는 `{이름}Event` 접미.
- 여기서는 도메인 타입(`@shared/types`)만 import. `electron`·`react` 의존 금지.
- 리턴 타입을 명시하지 않는 전역 규칙의 예외 — 양 프로세스의 계약이므로 타입을 명시.

```ts
// src/shared/ipc.ts
import type { Meeting, MeetingDetail } from './types'

export const IPC = {
  recording: { start: 'recording:start', chunk: 'recording:chunk', stop: 'recording:stop' },
  meetings: {
    list: 'meetings:list',
    get: 'meetings:get',
    rename: 'meetings:rename',
    delete: 'meetings:delete'
  },
  utterances: { updateText: 'utterances:updateText', reassign: 'utterances:reassignSpeaker' },
  speakers: { rename: 'speakers:rename', merge: 'speakers:merge' },
  models: { status: 'models:status', download: 'models:download' },
  events: { progress: 'pipeline:progress', modelDownload: 'models:downloadProgress' }
} as const

export type GetMeetingsResponse = Meeting[]

export interface GetMeetingRequest {
  meetingId: number
}
export type GetMeetingResponse = MeetingDetail

export interface RenameSpeakerRequest {
  meetingId: number
  label: string
  displayName: string
}

export interface PipelineProgressEvent {
  meetingId: number
  stage: 'vad' | 'stt' | 'diarize' | 'merge' | 'done' | 'error'
  percent: number
}
```

## 2. `src/main/ipc/handlers.ts` — 핸들러 등록

- 채널마다 `ipcMain.handle(IPC.xxx.yyy, ...)` 한 줄. 핸들러는 **얇게**: payload 검증 → `db`/`pipeline`/`models` 모듈 함수 호출 → 결과 반환.
- renderer에서 온 payload는 신뢰하지 않음. `unknown`으로 받아 좁힌 뒤 사용 (id는 정수, 문자열은 길이 제한).
- 비즈니스 로직·SQL·spawn을 핸들러 안에 쓰지 않음. 해당 모듈로 위임.
- push 이벤트는 `win.webContents.send(IPC.events.progress, payload)`로 보내되, payload 타입은 `PipelineProgressEvent`를 그대로 사용.
- 실패는 `Error`를 throw하면 renderer의 `invoke`가 reject됨. 사용자에게 보여줄 메시지는 한국어로.

```ts
// src/main/ipc/handlers.ts
import { ipcMain } from 'electron'
import { IPC, type GetMeetingRequest, type RenameSpeakerRequest } from '../../shared/ipc'
import { getMeeting } from '../db/meetings'
import { renameSpeaker } from '../db/speakers'

export const registerIpcHandlers = () => {
  ipcMain.handle(IPC.meetings.get, (_event, payload: GetMeetingRequest) => getMeeting(payload.meetingId))
  ipcMain.handle(IPC.speakers.rename, (_event, payload: RenameSpeakerRequest) => renameSpeaker(payload))
}
```

## 3. `src/preload/index.ts` — `window.api` 노출

- `api` 객체를 도메인별로 묶어 **타입이 붙은 함수만** 노출. `ipcRenderer` 객체 자체는 절대 노출하지 않음.
- 요청-응답은 `ipcRenderer.invoke`, 이벤트 구독 함수는 **해제 함수를 반환** (`() => void`).
- `export type Api = typeof api`를 유지해 `index.d.ts`의 `Window.api` 타입이 자동으로 따라오게 함 (스캐폴드 방식 그대로).
- 로직 없음. 채널과 타입을 연결하는 역할만.

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type GetMeetingRequest,
  type GetMeetingResponse,
  type GetMeetingsResponse,
  type PipelineProgressEvent
} from '../shared/ipc'

const api = {
  meetings: {
    list: (): Promise<GetMeetingsResponse> => ipcRenderer.invoke(IPC.meetings.list),
    get: (payload: GetMeetingRequest): Promise<GetMeetingResponse> =>
      ipcRenderer.invoke(IPC.meetings.get, payload)
  },
  events: {
    onPipelineProgress: (listener: (event: PipelineProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: PipelineProgressEvent) => listener(payload)
      ipcRenderer.on(IPC.events.progress, handler)
      return () => ipcRenderer.removeListener(IPC.events.progress, handler)
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
```

## 4. `@renderer/shared/api/{domain}/index.ts` — renderer 래퍼

renderer에서 `window.api`를 부르는 곳은 **여기뿐**. 컴포넌트·훅·`model`에서 `window.api`를 직접 호출하지 않음.

왜 한 겹 더 두는가: 테스트에서 모킹할 지점이 한 곳으로 모이고, preload의 함수 이름·시그니처가 바뀌어도 수정 범위가 이 폴더로 한정되며, JSDoc을 한 곳에 붙일 수 있음.

- 도메인별 폴더 + `index.ts` (`meetings`, `recording`, `utterances`, `speakers`, `models`, `events`).
- 요청 함수 이름은 **목적 + 메서드 + `Api`** (`getMeetingsApi`, `getMeetingApi`, `renameSpeakerApi`, `deleteMeetingApi`). 이벤트 구독 함수는 `on` + 이벤트 이름 (`onPipelineProgress`).
- async 함수로 작성하고 성공 시 데이터만 반환. 에러는 변환하지 않고 그대로 전파 (사용자 안내는 호출한 훅·컴포넌트가 담당).
- 인자가 2개 이상이면 객체 구조 분해, 타입은 `@shared/ipc`의 `Request` 타입을 재사용.
- JSDoc 필수: `@description`, `@param`, `@returns`, `@example`.

```ts
// src/renderer/src/shared/api/speakers/index.ts
import type { RenameSpeakerRequest } from '@shared/ipc'

/**
 * @description 회의의 화자 라벨(SPEAKER_00 등)에 표시 이름을 지정합니다. 같은 라벨의 모든 발화에 반영됩니다.
 * @param meetingId - 회의 ID
 * @param label - 화자 분리 결과의 원본 라벨
 * @param displayName - 사용자가 지정한 이름
 * @returns 없음
 * @example
 * await renameSpeakerApi({ meetingId: 3, label: 'SPEAKER_00', displayName: '김팀장' })
 */
export const renameSpeakerApi = async ({ meetingId, label, displayName }: RenameSpeakerRequest) => {
  await window.api.speakers.rename({ meetingId, label, displayName })
}
```

```ts
// src/renderer/src/shared/api/events/index.ts
import type { PipelineProgressEvent } from '@shared/ipc'

/**
 * @description 파이프라인 진행률 이벤트를 구독합니다.
 * @param listener - 진행률 이벤트 콜백
 * @returns 구독 해제 함수
 * @example
 * useEffect(() => onPipelineProgress(setProgress), [])
 */
export const onPipelineProgress = (listener: (event: PipelineProgressEvent) => void) =>
  window.api.events.onPipelineProgress(listener)
```

## 5. 소비 방법 (훅)

요청 함수를 감싸는 훅은 `@renderer/shared/hooks/domain/{domain}`에 둠. 데이터 요청 훅·이벤트 구독 훅 템플릿은 `.claude/rules/hook-guide.md` 참고. 서버 상태 라이브러리는 미도입 상태이며, 도입하더라도 이 문서의 1~4층은 그대로 두고 훅 층만 교체.

## 새 채널 추가 절차 (체크리스트)

1. `src/shared/ipc.ts`에 채널 상수 + `Request`/`Response`(또는 `Event`) 타입 추가
2. `src/main/ipc/handlers.ts`에 `ipcMain.handle` 등록, 실제 작업은 `db`/`pipeline`/`models` 모듈에 구현
3. `src/preload/index.ts`의 `api` 객체에 타입 붙은 함수 추가 (`Api` 타입이 자동 갱신됨)
4. `@renderer/shared/api/{domain}/index.ts`에 `xxxApi` 래퍼 + JSDoc 추가
5. 필요하면 `@renderer/shared/hooks/domain/{domain}`에 훅 추가
6. 큰 payload(PCM 청크)는 `ArrayBuffer`/`Uint8Array`로 보내고 main에서 즉시 파일에 append (renderer 메모리 누적 금지)
