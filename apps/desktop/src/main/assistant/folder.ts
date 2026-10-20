import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import path from 'node:path'
import { dialog, type OpenDialogOptions } from 'electron'
import type { AssistantFolderProblem, AssistantStatus } from '@shared/types'
import { getAssistantFolder, getAssistantPermissionMode } from '../db/settings'
import { t } from '../locale'
import { getMainWindow } from '../windows/main'

/**
 * 개인 비서의 작업 폴더 확인 (references/architecture.md "개인 비서 모드" > "작업 폴더").
 * 앱은 경로만 저장하고 폴더 안의 문서·설정은 읽고 쓸 때마다 디스크에서 다시 본다.
 */

const isPresent = (target: string) =>
  stat(target).then(
    () => true,
    () => false
  )

/** 채팅·에디터를 시작하기 전에 폴더를 쓸 수 있는지 본다 */
const checkFolder = async (folder: string): Promise<AssistantFolderProblem | null> => {
  const info = await stat(folder).catch(() => null)
  if (!info) return 'missing'
  if (!info.isDirectory()) return 'notDirectory'

  return access(folder, constants.R_OK | constants.W_OK).then(
    () => null,
    () => 'unreadable' as const
  )
}

/** 작업 폴더가 하위 폴더일 수 있어 상위로 올라가며 .git을 찾는다 */
const isInsideGitRepo = async (folder: string): Promise<boolean> => {
  if (await isPresent(path.join(folder, '.git'))) return true

  const parent = path.dirname(folder)
  return parent === folder ? false : isInsideGitRepo(parent)
}

export const getAssistantStatus = async (): Promise<AssistantStatus> => {
  const folder = getAssistantFolder()
  const folderProblem = folder ? await checkFolder(folder) : null

  return {
    folder,
    folderProblem,
    isGitRepo: folder && !folderProblem ? await isInsideGitRepo(folder) : false,
    permissionMode: getAssistantPermissionMode()
  }
}

/** 쓸 수 있는 작업 폴더 경로. 정해지지 않았거나 문제가 있으면 화면이 그대로 보여 줄 문장으로 멈춘다 */
export const requireWorkspaceFolder = async () => {
  const folder = getAssistantFolder()
  if (!folder) throw new Error(t().assistant.errors.noFolder)

  const problem = await checkFolder(folder)
  if (problem) throw new Error(t().assistant.folderProblems[problem])

  return folder
}

/** 폴더 고르기 대화상자. 취소하면 null */
export const pickWorkspaceFolder = async () => {
  const options: OpenDialogOptions = {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: getAssistantFolder() ?? undefined
  }
  const mainWindow = getMainWindow()
  const { canceled, filePaths } = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)

  return canceled ? null : (filePaths[0] ?? null)
}
