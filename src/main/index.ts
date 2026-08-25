import { join } from 'path'
import { app, shell, BrowserWindow, session } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { PipelineProgressEvent } from '@shared/ipc'
import { IPC } from '@shared/ipc'
import icon from '../../resources/icon.png?asset'
import { recordingsDir } from './audio/session'
import { closeDb } from './db/connection'
import { failStaleMeetings } from './db/meetings'
import { registerIpcHandlers } from './ipc/handlers'
import { info, messageOf, warn } from './log'
import { setPipelineProgressListener } from './pipeline/queue'
import { removeStalePipelineArtifacts } from './pipeline/run'

const WINDOW_WIDTH = 1000
const WINDOW_HEIGHT = 720

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** 로컬 앱이라 마이크 외의 권한 요청은 받지 않는다 */
const restrictPermissions = () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
}

const broadcastProgress = (event: PipelineProgressEvent) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC.events.progress, event)
  })
}

/** 이전 실행이 녹음·처리 중에 죽은 흔적을 정리한다. 실패해도 앱은 뜬다 */
const cleanupPreviousRun = async () => {
  const cleaned = failStaleMeetings()
  if (cleaned) info(`비정상 종료로 남은 회의 ${cleaned}건을 오류로 정리했습니다`)

  try {
    const removed = await removeStalePipelineArtifacts({ dir: recordingsDir() })
    if (removed) info(`남은 파이프라인 임시 파일 ${removed}개를 지웠습니다`)
  } catch (caught) {
    warn(`파이프라인 임시 파일 정리 실패: ${messageOf(caught)}`)
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.meetingstt.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  restrictPermissions()
  registerIpcHandlers()
  setPipelineProgressListener(broadcastProgress)
  await cleanupPreviousRun()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeDb()
})
