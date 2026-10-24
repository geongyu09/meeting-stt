import { readFile, stat, writeFile } from 'node:fs/promises'
import { recordSummaryPathOf } from '@shared/assistant'
import type { AssistantOpenFileEvent, OrganizeProgressEvent } from '@shared/ipc'
import { extractNoteLinks } from '@shared/note'
import type { OrganizeStatus } from '@shared/types'
import { findBrainPath, findMeeting, findMeetingNote, updateMeetingBrainPath } from '../db/meetings'
import { getAssistantAutoOrganize, getAssistantFolder } from '../db/settings'
import { listSpeakers } from '../db/speakers'
import { listUtterances } from '../db/utterances'
import { t } from '../locale'
import { info, messageOf, warn } from '../log'
import { showNotification } from '../windows/notify'

import { requireWorkspaceFolder } from './folder'
import {
  buildRecordNote,
  extractLegacySummary,
  recordNoteBaseName,
  writeFileIfAbsent,
  writeRecordNote
} from './recordNote'
import { runUnattendedTurn } from './unattendedTurn'
import { isMarkdownPath, toWorkspaceRelative } from './workspacePath'

/**
 * 녹음 기록 정리 큐 (references/features/assistant.md "녹음 기록 자동 정리").
 * GPU 큐와 따로 둔다 — 에이전트는 몇 분씩 걸려 같은 큐에 넣으면 다음 녹음의 STT를 막는다. 한 번에 하나씩 돈다.
 */

const ORGANIZE_TIMEOUT_MS = 10 * 60_000

/** UI 문구가 아니라 프롬프트라 UI 언어와 무관하게 한국어다 (루틴의 ROUTINE_PREAMBLE과 같은 방식) */
const instructionOf = ({ relativePath }: { relativePath: string }) =>
  `방금 끝난 회의의 전사 원문을 \`${relativePath}\`에 저장했다. ` +
  '원문 파일은 앱이 관리하므로 읽기만 하고 고치거나 옮기지 마라.\n' +
  `이 녹음의 요약은 \`${recordSummaryPathOf(relativePath)}\`에 새 파일로 써라. ` +
  '머리말이나 맨 위 제목 없이 핵심 요약·결정 사항·할 일을 적어라.\n' +
  '이 작업 폴더의 규칙(CLAUDE.md·AGENTS.md·스킬)에 녹음 기록을 정리하는 방법이 있으면 요약 위치 말고는 그대로 따르라.\n' +
  '요약만 쓰고 끝내지 마라. 녹음에서 나온 할 일·일정·프로젝트 결정·나중에 볼 지식은 이 폴더에서 그것을 두는 문서' +
  '(할 일 목록·일정·프로젝트 노트·위키 등)에 그 문서의 규칙과 형식대로 저장하고, 저장한 곳을 요약 파일의 `### 반영한 곳`에 적어라. ' +
  '사용자에 대한 새 사실은 프로필을 고치지 말고 요약 파일의 `### 확인 필요`에 후보로만 적어라.\n' +
  '사용자에게 질문하지 말고 끝까지 처리하라.'

const NOTE_INSTRUCTION =
  '원문의 `## 노트`는 사용자가 녹음하며 직접 적은 글이다. 전사보다 믿을 만한 단서로 보고(이름·용어 표기, 결정, 할 일) 정리에 반영하라.\n' +
  '노트의 링크는 열어 읽고 관련 내용을 정리에 반영하라. 링크 자체도 정리한 문서의 관련 자리에 남겨라. ' +
  '열 수 없는 링크(로그인 필요 등)는 링크만 남기고 읽지 못했다고 적어라.'

let queuedIds: string[] = []
let running: { meetingId: string; controller: AbortController } | null = null
/** 앱 종료 뒤에는 닫힌 DB를 건드리지 않는다 */
let isStopped = false
let openFileListener: ((event: AssistantOpenFileEvent) => void) | null = null
/** DB에 두지 않는다 — 앱을 다시 켜면 원문 경로(`brain_path`)만 남는다 */
const statuses = new Map<string, OrganizeStatus>()
let progressListener: ((event: OrganizeProgressEvent) => void) | null = null

export const setAssistantOpenFileListener = (listener: (event: AssistantOpenFileEvent) => void) => {
  openFileListener = listener
}

export const setOrganizeProgressListener = (listener: (event: OrganizeProgressEvent) => void) => {
  progressListener = listener
}

const setStatus = (status: OrganizeStatus) => {
  statuses.set(status.meetingId, status)
  progressListener?.(status)
}

/** 기록 카드의 "비서의 뇌" 줄. 앱을 다시 켜 메모리 상태가 없으면 원문 경로만 돌려준다 */
export const getOrganizeStatus = ({ meetingId }: { meetingId: string }) => {
  const status = statuses.get(meetingId)
  if (status) return status

  const brainPath = findBrainPath({ meetingId })
  if (!brainPath) return null

  const folder = getAssistantFolder()
  return {
    meetingId,
    stage: 'done' as const,
    notePath: folder ? toWorkspaceRelative({ roots: [folder], filePath: brainPath }) : brainPath,
    changedFiles: [],
    errorMessage: null
  }
}

/** 노트 링크의 호스트만 WebFetch를 허용한다 — 아무 도메인이나 열면 읽은 페이지의 지시가 폴더 내용을 밖으로 보낼 수 있다 */
const webFetchToolsOf = (note: string) => [
  ...new Set(extractNoteLinks(note).map((link) => `WebFetch(domain:${new URL(link).hostname})`))
]

/** 처음 저장과 동기화가 같은 내용을 만든다 — DB의 지금 회의록이 원문이다 */
const recordNoteOf = (meetingId: string) => {
  const meeting = findMeeting({ meetingId })
  if (!meeting) throw new Error(t().main.recording.meetingInfoNotFound)

  const note = findMeetingNote({ meetingId })
  const displayNames = Object.fromEntries(
    listSpeakers({ meetingId }).map((speaker) => [speaker.label, speaker.displayName])
  )
  const content = buildRecordNote({
    meeting: { ...meeting, note },
    utterances: listUtterances({ meetingId }),
    displayNames
  })

  return { meeting, note, content }
}

const saveRecordNote = async ({ meetingId, folder }: { meetingId: string; folder: string }) => {
  const { meeting, note, content } = recordNoteOf(meetingId)
  const filePath = await writeRecordNote({
    folder,
    baseName: recordNoteBaseName(meeting),
    content
  })
  updateMeetingBrainPath({ meetingId, brainPath: filePath })
  info(`회의 ${meetingId} 원문 저장: ${filePath}`)

  return {
    title: meeting.title,
    note,
    relativePath: toWorkspaceRelative({ roots: [folder], filePath })
  }
}

const isPresent = (target: string) =>
  stat(target).then(
    () => true,
    () => false
  )

/** 알림을 누르면 열 문서 — 요약 파일, 없으면 원문, 원문도 없으면 바꾼 파일 중 첫 .md */
const notifyDone = async ({
  title,
  folder,
  relativePath,
  changedFiles
}: {
  title: string
  folder: string
  relativePath: string
  changedFiles: string[]
}) => {
  const labels = t().assistant.organize.notification
  const candidates = [recordSummaryPathOf(relativePath), relativePath]
  const presences = await Promise.all(
    candidates.map((candidate) => isPresent(`${folder}/${candidate}`))
  )
  const path =
    candidates[presences.indexOf(true)] ?? changedFiles.find(isMarkdownPath) ?? relativePath

  showNotification({
    title: labels.doneTitle,
    body: labels.done({ title, count: changedFiles.length }),
    onClick: () => openFileListener?.({ path })
  })
}

const notifyFailed = ({ title, reason }: { title: string; reason: string }) => {
  const labels = t().assistant.organize.notification
  warn(`기록 정리 실패 (${title}): ${reason}`)
  showNotification({ title: labels.failedTitle, body: labels.failed({ title, reason }) })
}

const organizeMeeting = async (meetingId: string) => {
  const title = findMeeting({ meetingId })?.title ?? meetingId
  const base = { meetingId, notePath: null, changedFiles: [], errorMessage: null }
  let notePath: string | null = null
  setStatus({ ...base, stage: 'saving' })

  try {
    const folder = await requireWorkspaceFolder()
    const saved = await saveRecordNote({ meetingId, folder })
    notePath = saved.relativePath
    if (!getAssistantAutoOrganize()) {
      info(`회의 ${meetingId} 자동 정리 꺼짐: 원문만 저장`)
      setStatus({ ...base, notePath, stage: 'done' })
      return
    }

    setStatus({ ...base, notePath, stage: 'running' })
    const controller = new AbortController()
    running = { meetingId, controller }
    const instruction = instructionOf({ relativePath: saved.relativePath })
    const result = await runUnattendedTurn({
      folder,
      text: saved.note.trim() ? `${instruction}\n\n${NOTE_INSTRUCTION}` : instruction,
      controller,
      timeoutMs: ORGANIZE_TIMEOUT_MS,
      timeoutMessage: t().assistant.organize.errors.timeout,
      extraAllowedTools: webFetchToolsOf(saved.note)
    })

    // 실패해도 그때까지 바꾼 파일은 보여 준다 — 사용자가 열어 고칠 수 있게
    const { changedFiles, error } = result
    setStatus({
      ...base,
      notePath,
      changedFiles,
      stage: error ? 'error' : 'done',
      errorMessage: error
    })
    if (error) notifyFailed({ title: saved.title, reason: error })
    else await notifyDone({ ...saved, folder, changedFiles })
  } catch (caught) {
    if (isStopped) return
    const reason = messageOf(caught)
    setStatus({ ...base, notePath, stage: 'error', errorMessage: reason })
    notifyFailed({ title, reason })
  } finally {
    running = null
  }
}

let syncChain = Promise.resolve()

const isMissing = (caught: unknown) =>
  typeof caught === 'object' && caught !== null && 'code' in caught && caught.code === 'ENOENT'

const rewriteRecordNote = async (meetingId: string) => {
  const brainPath = findBrainPath({ meetingId })
  if (!brainPath) return

  const current = await readFile(brainPath, 'utf8').catch((caught: unknown) => {
    if (isMissing(caught)) return null
    throw caught
  })
  // 사용자가 지웠거나 옮긴 원문은 다시 만들지 않는다
  if (current === null) {
    info(`회의 ${meetingId} 원문 갱신 건너뜀: 파일 없음 (${brainPath})`)
    return
  }

  // 옛 원문은 에이전트가 쓴 요약을 품고 있다. 다시 쓰기 전에 요약 파일로 옮겨 잃지 않는다
  const legacySummary = extractLegacySummary(current)
  if (legacySummary) {
    await writeFileIfAbsent({ filePath: recordSummaryPathOf(brainPath), content: legacySummary })
  }

  const { content } = recordNoteOf(meetingId)
  if (content === current) return
  await writeFile(brainPath, content, 'utf8')
  info(`회의 ${meetingId} 원문 갱신: ${brainPath}`)
}

/**
 * 앱에서 회의록이 바뀌면 원문을 다시 쓴다 (references/features/assistant.md "원문 동기화와 요약 파일").
 * 한 줄로 이어서 쓴다 — 내용은 쓰는 순간 DB에서 조립하므로 편집이 겹쳐도 마지막 상태가 남는다.
 * 실패해도 편집은 DB에 저장돼 있어 로그만 남긴다.
 */
export const syncRecordNote = ({ meetingId }: { meetingId: string }) => {
  syncChain = syncChain
    .then(() => (isStopped ? undefined : rewriteRecordNote(meetingId)))
    .catch((caught: unknown) => warn(`회의 ${meetingId} 원문 갱신 실패: ${messageOf(caught)}`))
}

/** "요약 만들기" 결과를 원문을 저장한 회의의 요약 파일에도 쓴다 — 기록 카드는 요약 파일을 보여 준다 */
export const writeRecordSummary = async ({
  meetingId,
  summary
}: {
  meetingId: string
  summary: string
}) => {
  const brainPath = findBrainPath({ meetingId })
  if (!brainPath || !(await isPresent(brainPath))) return

  await writeFile(recordSummaryPathOf(brainPath), `${summary.trim()}\n`, 'utf8')
}

const drainQueue = async () => {
  if (running || isStopped) return

  const [meetingId, ...rest] = queuedIds
  if (!meetingId) return
  queuedIds = rest

  await organizeMeeting(meetingId)
  await drainQueue()
}

/** 파이프라인(교정까지)이 끝난 회의를 뇌에 저장하고 정리한다. 이미 줄 서 있으면 두 번 넣지 않는다 */
export const enqueueOrganize = ({ meetingId }: { meetingId: string }) => {
  if (isStopped || running?.meetingId === meetingId || queuedIds.includes(meetingId)) return
  // 작업 폴더를 고르지 않았으면 비서를 쓰지 않는 사용자다. 알리지 않는다
  if (!getAssistantFolder()) {
    info(`회의 ${meetingId} 뇌 저장 건너뜀: 작업 폴더 없음`)
    return
  }

  queuedIds = [...queuedIds, meetingId]
  setStatus({ meetingId, stage: 'queued', notePath: null, changedFiles: [], errorMessage: null })
  drainQueue().catch((caught: unknown) => warn(`정리 큐 처리 실패: ${messageOf(caught)}`))
}

/** 앱 종료(`will-quit`). 남은 정리 잡은 버린다 — 원문은 이미 저장돼 있다 */
export const stopOrganize = () => {
  isStopped = true
  queuedIds = []
  running?.controller.abort()
}
