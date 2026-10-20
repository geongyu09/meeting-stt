/**
 * 개인 비서 모드의 순수 로직 (references/architecture.md "개인 비서 모드").
 * 권한 모드·공급자 판정과 renderer가 보낸 payload 검증을 둔다. spawn·파일 IO는 `src/main/assistant/*`이 담당한다.
 */

import { assistantKo } from './locales/assistant'
import type { AssistantPermissionMode, AssistantProvider } from './types'

/** main이 던지는 검증 오류 문구. 기본은 한국어 사전이고 main은 현재 언어의 `t().assistant.errors`를 넘긴다 */
export type AssistantErrorMessages = typeof assistantKo.errors

export const ASSISTANT_PERMISSION_MODES: AssistantPermissionMode[] = [
  'acceptEdits',
  'bypassPermissions'
]

export const DEFAULT_ASSISTANT_PERMISSION_MODE: AssistantPermissionMode = 'acceptEdits'

export const ASSISTANT_PROVIDERS: AssistantProvider[] = ['claude-cli', 'codex-cli']

/** 질문 한 번의 최대 글자 수. 문서를 통째로 붙여 넣는 경우까지 넉넉하게 둔다 */
export const MAX_QUESTION_CHARS = 20_000

/** 에디터가 열고 저장하는 문서 한 개의 최대 크기. 마크다운 메모가 이보다 크면 textarea가 버벅인다 */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024

/** 상대 경로 길이 상한. macOS의 PATH_MAX(1024)와 같다 */
export const MAX_WORKSPACE_PATH_CHARS = 1024

export const isAssistantPermissionMode = (value: unknown): value is AssistantPermissionMode =>
  typeof value === 'string' && (ASSISTANT_PERMISSION_MODES as string[]).includes(value)

export const isAssistantProvider = (value: unknown): value is AssistantProvider =>
  typeof value === 'string' && (ASSISTANT_PROVIDERS as string[]).includes(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * @description `assistant:send` payload를 검증합니다. 모르는 공급자·빈 질문·너무 긴 질문은 거절한다.
 * @param payload - renderer가 보낸 값
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @returns 공급자와 앞뒤 공백을 자른 질문
 * @example
 * const { provider, text } = readAssistantMessagePayload({ provider: 'claude-cli', text: '요약해 줘' })
 */
export const readAssistantMessagePayload = (
  payload: unknown,
  errors: AssistantErrorMessages = assistantKo.errors
) => {
  if (!isRecord(payload) || !isAssistantProvider(payload.provider)) {
    throw new Error(errors.invalidProvider)
  }
  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    throw new Error(errors.emptyQuestion)
  }
  if (payload.text.length > MAX_QUESTION_CHARS) throw new Error(errors.questionTooLong)

  return { provider: payload.provider, text: payload.text.trim() }
}

/**
 * @description `assistant:setPermissionMode` payload를 검증합니다.
 * @param payload - renderer가 보낸 값
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @returns 권한 모드
 * @example
 * readPermissionModePayload({ permissionMode: 'acceptEdits' }) // 'acceptEdits'
 */
export const readPermissionModePayload = (
  payload: unknown,
  errors: AssistantErrorMessages = assistantKo.errors
) => {
  if (!isRecord(payload) || !isAssistantPermissionMode(payload.permissionMode)) {
    throw new Error(errors.invalidPermissionMode)
  }

  return payload.permissionMode
}

/**
 * @description 문서 읽기 요청의 경로를 꺼냅니다. 형식만 보고, 작업 폴더 안인지는 main이 실제 경로로 확인한다.
 * @param payload - renderer가 보낸 값
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @returns 상대 경로
 * @example
 * readWorkspacePathPayload({ path: 'notes/a.md' }) // 'notes/a.md'
 */
export const readWorkspacePathPayload = (
  payload: unknown,
  errors: AssistantErrorMessages = assistantKo.errors
) => {
  if (
    !isRecord(payload) ||
    typeof payload.path !== 'string' ||
    !payload.path ||
    payload.path.length > MAX_WORKSPACE_PATH_CHARS
  ) {
    throw new Error(errors.invalidPath)
  }

  return payload.path
}

/**
 * @description 문서 저장 요청을 검증합니다. 본문이 문자열이 아니거나 너무 크면 거절한다.
 * @param payload - renderer가 보낸 값
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @returns 상대 경로와 본문
 * @example
 * const { path, content } = readWorkspaceWritePayload({ path: 'a.md', content: '# 제목' })
 */
export const readWorkspaceWritePayload = (
  payload: unknown,
  errors: AssistantErrorMessages = assistantKo.errors
) => {
  const path = readWorkspacePathPayload(payload, errors)
  const content = (payload as Record<string, unknown>).content
  if (typeof content !== 'string') throw new Error(errors.invalidContent)
  if (new TextEncoder().encode(content).byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error(errors.documentTooLarge)
  }

  return { path, content }
}
