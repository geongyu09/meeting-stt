import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'

const WINDOW_WIDTH = 1000
const WINDOW_HEIGHT = 720

/**
 * 창이 둘이 되면서 `BrowserWindow.getAllWindows()[0]`을 메인 창으로 가정할 수 없게 됐다.
 * 위젯이 먼저 잡히면 재생성·포커스가 엉뚱한 창을 집는다 (references/pitfalls.md).
 */
let mainWindow: BrowserWindow | null = null

export const getMainWindow = () => (mainWindow?.isDestroyed() ? null : mainWindow)

export const createMainWindow = () => {
  const window = new BrowserWindow({
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

  window.on('ready-to-show', () => {
    window.show()
  })

  window.on('closed', () => {
    mainWindow = null
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)

    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = window

  return window
}

/** 위젯·트레이·단축키에서 메인 창을 앞으로 가져올 때 쓴다. 닫혀 있으면 다시 만든다 */
export const showMainWindow = () => {
  const window = getMainWindow() ?? createMainWindow()

  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()

  return window
}
