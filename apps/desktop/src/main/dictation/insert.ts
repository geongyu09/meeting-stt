import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { clipboard, shell, systemPreferences } from 'electron'
import type { DictationInsertMode } from '@shared/ipc'
import { textInsertBinPath } from '../bin/paths'
import { t } from '../locale'
import { warn } from '../log'

/**
 * 받아쓰기 조각을 최전면 앱의 커서 자리에 끼워 넣는다. 동봉 Swift 도구 `textInsert`가
 * 클립보드 저장 → 텍스트 쓰기 → ⌘V → 원복을 맡고, 권한이 없거나 실패하면 클립보드에만 남긴다
 * (references/architecture.md "받아쓰기" > "끼워 넣기").
 */

/** 시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용 */
const ACCESSIBILITY_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
/** 도구는 settle 200ms 뒤 끝난다. 이보다 오래 걸리면 ⌘V가 어딘가에 막힌 것이다 */
const INSERT_TIMEOUT_MS = 5_000
const STDERR_TAIL_CHARS = 200

/** 도구 종료 코드 (native/textInsert/main.swift) */
const EXIT_ACCESSIBILITY = 2
const EXIT_SECURE_INPUT = 3
const EXIT_SELF_FRONTMOST = 4

/** 폴백으로 내려간 이유. `accessibility`면 세션 나머지도 클립보드 모드로 돈다 */
export type InsertFallbackReason = 'accessibility' | 'secureInput' | 'selfFrontmost' | 'failed'

export interface InsertResult {
  mode: DictationInsertMode
  /** 붙여 넣기 모드였는데 클립보드로 내려갔을 때만 */
  fallbackReason?: InsertFallbackReason
  errorMessage?: string
}

/** 접근성 권한. `shouldPrompt`면 권한이 없을 때 시스템 안내 창을 띄운다 (받아쓰기 첫 시작에 한 번) */
export const isAccessibilityTrusted = ({ shouldPrompt }: { shouldPrompt: boolean }) =>
  process.platform === 'darwin' && systemPreferences.isTrustedAccessibilityClient(shouldPrompt)

export const isInsertToolAvailable = () => existsSync(textInsertBinPath())

export const openAccessibilitySettings = () => shell.openExternal(ACCESSIBILITY_SETTINGS_URL)

const runInsertTool = (text: string) =>
  new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(textInsertBinPath(), [], { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), INSERT_TIMEOUT_MS)

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL_CHARS)
    })
    child.on('error', (caught) => {
      clearTimeout(timer)
      reject(caught)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stderr })
    })
    // 도구가 먼저 죽으면 EPIPE가 난다. 종료 처리는 close 핸들러가 한다
    child.stdin.on('error', () => undefined)
    child.stdin.end(text)
  })

const fallbackReasonOf = (code: number | null): InsertFallbackReason => {
  if (code === EXIT_ACCESSIBILITY) return 'accessibility'
  if (code === EXIT_SECURE_INPUT) return 'secureInput'
  if (code === EXIT_SELF_FRONTMOST) return 'selfFrontmost'

  return 'failed'
}

const fallbackMessageOf = (reason: InsertFallbackReason) => t().main.dictation.insert[reason]

interface InsertParams {
  text: string
  mode: DictationInsertMode
}

const insertNow = async ({ text, mode }: InsertParams): Promise<InsertResult> => {
  if (mode === 'clipboard' || !isInsertToolAvailable()) {
    clipboard.writeText(text)

    return { mode: 'clipboard' }
  }

  try {
    const { code, stderr } = await runInsertTool(text)
    if (code === 0) return { mode: 'paste' }

    const fallbackReason = fallbackReasonOf(code)
    warn(`textInsert 실패 (코드 ${code}): ${stderr.trim()}`)
    clipboard.writeText(text)

    return { mode: 'clipboard', fallbackReason, errorMessage: fallbackMessageOf(fallbackReason) }
  } catch (caught) {
    warn(`textInsert 실행 실패: ${caught instanceof Error ? caught.message : String(caught)}`)
    clipboard.writeText(text)

    return {
      mode: 'clipboard',
      fallbackReason: 'failed',
      errorMessage: fallbackMessageOf('failed')
    }
  }
}

let queue: Promise<unknown> = Promise.resolve()

/** 한 번에 하나만 돈다 — 조각이 연달아 확정돼도 도구 둘이 겹치면 클립보드 원복 순서가 꼬인다 */
export const insertDictationText = (params: InsertParams) => {
  const run = queue.then(() => insertNow(params))
  queue = run.catch(() => undefined)

  return run
}
