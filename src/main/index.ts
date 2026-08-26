import { join } from 'path'
import { app, shell, BrowserWindow, session } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { PipelineProgressEvent, SummaryProgressEvent, UpdateAvailableEvent } from '@shared/ipc'
import { IPC } from '@shared/ipc'
import icon from '../../resources/icon.png?asset'
import { recordingsDir } from './audio/session'
import { closeDb } from './db/connection'
import { failStaleMeetings } from './db/meetings'
import { getAppSettings, getWhisperModelId } from './db/settings'
import { registerIpcHandlers } from './ipc/handlers'
import { info, messageOf, warn } from './log'
import { setSelectedWhisperModelId } from './models/paths'
import { setPipelineProgressListener, setSummaryProgressListener } from './pipeline/queue'
import { removeStalePipelineArtifacts } from './pipeline/run'
import { checkForUpdates } from './updater'

const WINDOW_WIDTH = 1000
const WINDOW_HEIGHT = 720

function createWindow(): BrowserWindow {
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

  return mainWindow
}

/** 로컬 앱이라 마이크 외의 권한 요청은 받지 않는다 */
const restrictPermissions = () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
}

const broadcast = ({ channel, event }: { channel: string; event: unknown }) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, event)
  })
}

const broadcastProgress = (event: PipelineProgressEvent) =>
  broadcast({ channel: IPC.events.progress, event })

const broadcastSummaryProgress = (event: SummaryProgressEvent) =>
  broadcast({ channel: IPC.events.summary, event })

/**
 * 설정에서 켠 사용자만, 창이 뜬 직후 한 번 확인한다. 새 버전이 있으면 알리기만 하고
 * 내려받기는 사용자가 배너에서 요청한다 (references/distribution.md 7절).
 */
const notifyUpdateIfAvailable = async () => {
  const version = await checkForUpdates({ isEnabled: getAppSettings().isUpdateCheckEnabled })
  if (!version) return

  const event: UpdateAvailableEvent = { version }
  broadcast({ channel: IPC.events.updateAvailable, event })
}

/** 두 번째 실행은 먼저 뜬 창을 앞으로 가져온다 */
const focusExistingWindow = () => {
  const [window] = BrowserWindow.getAllWindows()
  if (!window) return

  if (window.isMinimized()) window.restore()
  window.focus()
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

// 두 인스턴스가 같은 DB를 열면 나중에 뜬 쪽의 시작 정리가 처리 중 회의를 오류로 덮어쓴다 (references/distribution.md 9절)
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) app.quit()

app.on('second-instance', focusExistingWindow)

app.whenReady().then(async () => {
  // quit()은 비동기라 ready가 먼저 올 수 있다. 두 번째 인스턴스는 DB를 열지 않는다
  if (!isPrimaryInstance) return

  electronApp.setAppUserModelId('com.meetingstt.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  restrictPermissions()
  registerIpcHandlers()
  setPipelineProgressListener(broadcastProgress)
  setSummaryProgressListener(broadcastSummaryProgress)
  // 온보딩에서 고른 모델을 런타임 선택값으로 넣는다. 이후 파일명은 models/paths.ts만 정한다
  setSelectedWhisperModelId(getWhisperModelId())
  await cleanupPreviousRun()

  const mainWindow = createWindow()
  mainWindow.once('ready-to-show', () => {
    void notifyUpdateIfAvailable()
  })

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
