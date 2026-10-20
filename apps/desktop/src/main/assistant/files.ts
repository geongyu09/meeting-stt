import { watch, type Dirent, type FSWatcher } from 'node:fs'
import { readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { WorkspaceFilesChangedEvent } from '@shared/ipc'
import { MAX_DOCUMENT_BYTES } from '@shared/assistant'
import { t } from '../locale'
import { messageOf, warn } from '../log'

import { isInsideFolder, isMarkdownPath, resolveWorkspaceFile } from './workspacePath'

/**
 * 작업 폴더의 마크다운 문서 목록·읽기·저장·변경 감시 (references/architecture.md "개인 비서 모드" > "문서 에디터").
 * renderer가 보낸 경로는 신뢰하지 않는다 — 상대 경로를 풀어 폴더 안인지, 심볼릭 링크를 따라가도 폴더 안인지 둘 다 본다.
 */

/** 홈 폴더처럼 큰 폴더를 골라도 목록이 끝나도록 상한을 둔다 */
const MAX_LISTED_FILES = 2000

/** 같은 저장에 감시 이벤트가 여러 번 온다. 모아서 한 번 알린다 */
const FILES_CHANGED_DEBOUNCE_MS = 200

/** 점으로 시작하는 폴더(.git·.claude)와 의존성 폴더는 문서가 아니다 */
const isSkippedDirName = (name: string) => name.startsWith('.') || name === 'node_modules'

const isSkippedPath = (relativePath: string) =>
  relativePath.split(path.sep).slice(0, -1).some(isSkippedDirName)

const toPosix = (relativePath: string) => relativePath.split(path.sep).join('/')

const readEntries = (dir: string) =>
  readdir(dir, { withFileTypes: true }).catch((caught: unknown): Dirent[] => {
    warn(`작업 폴더 읽기 실패 (${dir}): ${messageOf(caught)}`)
    return []
  })

const collectMarkdown = async ({
  root,
  dir,
  found
}: {
  root: string
  dir: string
  found: string[]
}) => {
  const entries = await readEntries(dir)

  for (const entry of entries) {
    if (found.length >= MAX_LISTED_FILES) return
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory() && !isSkippedDirName(entry.name)) {
      await collectMarkdown({ root, dir: entryPath, found })
    } else if (entry.isFile() && isMarkdownPath(entry.name)) {
      found.push(toPosix(path.relative(root, entryPath)))
    }
  }
}

/** 작업 폴더의 .md 상대 경로를 사전순으로 돌려준다 */
export const listWorkspaceFiles = async ({ folder }: { folder: string }) => {
  const found: string[] = []
  await collectMarkdown({ root: folder, dir: folder, found })

  return found.toSorted((a, b) => a.localeCompare(b))
}

/** 경로 형식을 확인한 뒤, 이미 있는 것(파일 또는 저장할 폴더)의 실제 경로까지 폴더 안인지 본다 */
const resolveSafely = async ({
  folder,
  relativePath,
  existing
}: {
  folder: string
  relativePath: string
  existing: 'file' | 'parent'
}) => {
  const errors = t().assistant.errors
  const resolved = resolveWorkspaceFile({ root: folder, relativePath })
  if (resolved.problem) throw new Error(errors[resolved.problem])

  const target = existing === 'file' ? resolved.filePath : path.dirname(resolved.filePath)
  const [realRoot, realTarget] = await Promise.all([realpath(folder), realpath(target)])
  const isSameOrInside =
    realTarget === realRoot || isInsideFolder({ root: realRoot, target: realTarget })
  if (!isSameOrInside) throw new Error(errors.outsideFolder)

  return resolved.filePath
}

export const readWorkspaceFile = async ({
  folder,
  relativePath
}: {
  folder: string
  relativePath: string
}) => {
  const filePath = await resolveSafely({ folder, relativePath, existing: 'file' })
  if ((await stat(filePath)).size > MAX_DOCUMENT_BYTES) {
    throw new Error(t().assistant.errors.documentTooLarge)
  }

  return { path: relativePath, content: await readFile(filePath, 'utf8') }
}

export const writeWorkspaceFile = async ({
  folder,
  relativePath,
  content
}: {
  folder: string
  relativePath: string
  content: string
}) => {
  const filePath = await resolveSafely({ folder, relativePath, existing: 'parent' })
  await writeFile(filePath, content, 'utf8')
}

let filesChangedListener: ((event: WorkspaceFilesChangedEvent) => void) | null = null

export const setWorkspaceFilesListener = (
  listener: (event: WorkspaceFilesChangedEvent) => void
) => {
  filesChangedListener = listener
}

let watcher: FSWatcher | null = null
let watchedFolder: string | null = null
let pendingPaths = new Set<string>()
let flushTimer: NodeJS.Timeout | null = null

const flushChangedPaths = () => {
  flushTimer = null
  const paths = [...pendingPaths]
  pendingPaths = new Set()
  if (paths.length) filesChangedListener?.({ paths })
}

const handleWatchEvent = (filename: string | null) => {
  if (!filename || !isMarkdownPath(filename) || isSkippedPath(filename)) return

  pendingPaths.add(toPosix(filename))
  flushTimer ??= setTimeout(flushChangedPaths, FILES_CHANGED_DEBOUNCE_MS)
}

export const stopWatchingWorkspace = () => {
  watcher?.close()
  watcher = null
  watchedFolder = null
}

/**
 * 에이전트가 고친 문서를 에디터가 다시 읽게 감시한다. 같은 폴더를 이미 보고 있으면 그대로 두고,
 * 폴더가 바뀌면 이전 감시를 닫는다. 감시 실패는 기능을 막지 않는다 — 다시 읽기 버튼이 있다.
 */
export const watchWorkspace = ({ folder }: { folder: string }) => {
  if (watcher && watchedFolder === folder) return

  stopWatchingWorkspace()
  try {
    watcher = watch(folder, { recursive: true }, (_event, filename) => handleWatchEvent(filename))
    watcher.on('error', (caught) => {
      warn(`작업 폴더 감시 오류: ${messageOf(caught)}`)
      stopWatchingWorkspace()
    })
    watchedFolder = folder
  } catch (caught) {
    warn(`작업 폴더 감시 시작 실패: ${messageOf(caught)}`)
  }
}
