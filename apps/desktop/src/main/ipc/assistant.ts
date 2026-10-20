import { ipcMain } from 'electron'
import {
  IPC,
  type GetAssistantStateResponse,
  type GetAssistantStatusResponse,
  type ListWorkspaceFilesResponse,
  type ReadWorkspaceFileResponse
} from '@shared/ipc'
import {
  readAssistantMessagePayload,
  readPermissionModePayload,
  readWorkspacePathPayload,
  readWorkspaceWritePayload
} from '@shared/assistant'
import { setAssistantFolder, setAssistantPermissionMode } from '../db/settings'
import { t } from '../locale'
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  watchWorkspace,
  writeWorkspaceFile
} from '../assistant/files'
import {
  getAssistantStatus,
  pickWorkspaceFolder,
  requireWorkspaceFolder
} from '../assistant/folder'
import {
  cancelAssistant,
  getAssistantChatState,
  isAssistantRunning,
  resetAssistantChat,
  sendAssistantMessage
} from '../assistant/session'

/**
 * 개인 비서 채널 (references/architecture.md "개인 비서 모드" > "IPC").
 * `handlers.ts`가 400줄을 넘어 따로 두고 `registerIpcHandlers`가 부른다.
 */

/** 다른 폴더에서는 Claude Code 세션을 이어 갈 수 없어 대화를 비운다. 실행 중이면 바꾸지 않는다 */
const handleChooseFolder = async (): Promise<GetAssistantStatusResponse> => {
  if (isAssistantRunning()) throw new Error(t().assistant.errors.busy)

  const folder = await pickWorkspaceFolder()
  if (folder) {
    setAssistantFolder({ folder })
    resetAssistantChat()
    watchWorkspace({ folder })
  }

  return getAssistantStatus()
}

/** 목록을 처음 읽을 때 감시를 시작한다 — 비서 화면을 열지 않은 사용자의 폴더는 보지 않는다 */
const handleListFiles = async (): Promise<ListWorkspaceFilesResponse> => {
  const folder = await requireWorkspaceFolder()
  watchWorkspace({ folder })

  return listWorkspaceFiles({ folder })
}

export const registerAssistantHandlers = () => {
  ipcMain.handle(IPC.assistant.status, (): Promise<GetAssistantStatusResponse> =>
    getAssistantStatus()
  )

  ipcMain.handle(IPC.assistant.chooseFolder, () => handleChooseFolder())

  ipcMain.handle(
    IPC.assistant.setPermissionMode,
    (_event, payload): Promise<GetAssistantStatusResponse> => {
      setAssistantPermissionMode({
        permissionMode: readPermissionModePayload(payload, t().assistant.errors)
      })

      return getAssistantStatus()
    }
  )

  ipcMain.handle(IPC.assistant.state, (): GetAssistantStateResponse => getAssistantChatState())

  // 턴이 시작되면 바로 돌아온다. 답은 몇 분 걸릴 수 있어 상태 push로 받는다
  ipcMain.handle(IPC.assistant.send, (_event, payload) =>
    sendAssistantMessage(readAssistantMessagePayload(payload, t().assistant.errors))
  )

  ipcMain.handle(IPC.assistant.cancel, () => cancelAssistant())

  ipcMain.handle(IPC.assistant.reset, (): GetAssistantStateResponse => resetAssistantChat())

  ipcMain.handle(IPC.assistant.listFiles, () => handleListFiles())

  ipcMain.handle(
    IPC.assistant.readFile,
    async (_event, payload): Promise<ReadWorkspaceFileResponse> =>
      readWorkspaceFile({
        folder: await requireWorkspaceFolder(),
        relativePath: readWorkspacePathPayload(payload, t().assistant.errors)
      })
  )

  ipcMain.handle(IPC.assistant.writeFile, async (_event, payload) => {
    const { path, content } = readWorkspaceWritePayload(payload, t().assistant.errors)

    await writeWorkspaceFile({
      folder: await requireWorkspaceFolder(),
      relativePath: path,
      content
    })
  })
}
