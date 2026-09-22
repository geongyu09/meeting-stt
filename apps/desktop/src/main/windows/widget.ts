import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC, type RecordingCommandEvent } from '@shared/ipc'
import { getAppSettings, getWidgetBounds, setWidgetBounds } from '../db/settings'
import { warn } from '../log'

const WIDGET_WIDTH = 264
const WIDGET_HEIGHT = 248
/** 화면 가장자리와의 여백 */
const EDGE_MARGIN = 16
/** createHashRouter가 읽는 경로. 앞의 '/'가 없으면 '#widget'이 되어 라우트가 맞지 않는다 */
const WIDGET_ROUTE_HASH = '/widget'

/**
 * 오디오 그래프의 유일한 소유자. 설정(`widget.enabled`)은 **보이는지 여부만** 정하고 창은 항상 만든다 —
 * 창이 없으면 전역 단축키로도 녹음할 수 없다 (references/architecture.md).
 */
let widgetWindow: BrowserWindow | null = null

export const getWidgetWindow = () => (widgetWindow?.isDestroyed() ? null : widgetWindow)

/** `workArea`를 기준으로 우측 세로 중앙. `bounds`를 쓰면 메뉴바·Dock을 침범한다 */
const defaultPosition = () => {
  const { workArea } = screen.getPrimaryDisplay()

  return {
    x: workArea.x + workArea.width - WIDGET_WIDTH - EDGE_MARGIN,
    y: Math.round(workArea.y + (workArea.height - WIDGET_HEIGHT) / 2)
  }
}

/** 외장 모니터를 뺀 뒤 화면 밖에 남은 위치는 버린다 (references/pitfalls.md) */
const isOnScreen = ({ x, y }: { x: number; y: number }) =>
  screen.getAllDisplays().some(({ workArea }) => {
    const isInsideX = x + WIDGET_WIDTH > workArea.x && x < workArea.x + workArea.width
    const isInsideY = y + WIDGET_HEIGHT > workArea.y && y < workArea.y + workArea.height

    return isInsideX && isInsideY
  })

const restoredPosition = () => {
  const saved = getWidgetBounds()

  return saved && isOnScreen(saved) ? saved : defaultPosition()
}

const moveToDefaultIfOffScreen = () => {
  const window = getWidgetWindow()
  if (!window) return

  const [x, y] = window.getPosition()
  if (isOnScreen({ x, y })) return

  const next = defaultPosition()
  window.setPosition(next.x, next.y)
  setWidgetBounds(next)
}

export const createWidgetWindow = () => {
  const { x, y } = restoredPosition()
  const window = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // 다른 앱 위에 뜨면서 키 입력 포커스를 뺏지 않는다. 회의 중 타이핑을 방해하면 안 된다
    ...(process.platform === 'darwin' ? { type: 'panel' as const, vibrancy: 'hud' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // 가려진 창은 타이머·메시지 처리가 throttling된다. 그래프 소유자라 꺼야 한다 (references/pitfalls.md)
      backgroundThrottling: false
    }
  })

  window.setAlwaysOnTop(true, 'floating')
  // 화상회의를 전체화면으로 쓰는 경우가 많다
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  window.on('ready-to-show', () => {
    if (getAppSettings().isWidgetEnabled) window.showInactive()
  })

  window.on('moved', () => {
    const [movedX, movedY] = window.getPosition()
    setWidgetBounds({ x: movedX, y: movedY })
  })

  window.on('closed', () => {
    widgetWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${WIDGET_ROUTE_HASH}`)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash: WIDGET_ROUTE_HASH })
  }

  widgetWindow = window
  screen.on('display-metrics-changed', moveToDefaultIfOffScreen)

  return window
}

/** 포커스를 뺏지 않도록 `showInactive`를 쓴다 — 녹음 중 타이핑하던 창이 그대로 유지돼야 한다 */
export const setWidgetVisible = ({ isVisible }: { isVisible: boolean }) => {
  const window = getWidgetWindow()
  if (!window) return

  if (isVisible) window.showInactive()
  else window.hide()
}

export const toggleWidgetVisible = () => {
  const window = getWidgetWindow()
  if (!window) return

  setWidgetVisible({ isVisible: !window.isVisible() })
}

/**
 * 전역 단축키·Tray·메인 창의 요청을 그래프 소유자에게 넘긴다.
 * main → renderer → main으로 한 바퀴 돌지만 `getUserMedia`가 renderer 전용이라 피할 수 없다.
 */
export const requestRecordingCommand = (event: RecordingCommandEvent) => {
  const window = getWidgetWindow()
  if (!window) {
    warn('녹음 위젯 창이 없어 녹음 명령을 전달하지 못했습니다')

    return
  }

  window.webContents.send(IPC.events.recordingCommand, event)
}
