import { join } from 'node:path'
import { app, Menu, nativeImage, Tray } from 'electron'
import { is } from '@electron-toolkit/utils'
import { getRecordingState } from '../audio/session'
import { controlDictation, copyLastDictation, getDictationState } from '../dictation/session'
import { getLocale, t } from '../locale'
import { messageOf, warn } from '../log'
import { showMainWindow } from './main'
import { requestRecordingCommand, toggleWidgetVisible } from './widget'

/** 파일명이 Template으로 끝나야 macOS가 다크/라이트에 맞춰 반전한다 (references/pitfalls.md) */
const TRAY_ICON_FILE = 'trayTemplate.png'
const TITLE_TICK_MS = 1000
const MS_PER_SEC = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

/** 메뉴바 제목의 상태 기호. 녹음 ●, 일시정지 ‖, 받아쓰기 ✎ (references/architecture.md "받아쓰기") */
const RECORDING_MARK = '●'
const PAUSED_MARK = '‖'
const DICTATION_MARK = '✎'

interface MenuState {
  isRecording: boolean
  isDictating: boolean
  hasLastDictation: boolean
  locale: string
}

let tray: Tray | null = null
/** 메뉴는 녹음·받아쓰기 상태나 언어가 바뀔 때만 다시 만든다. 레벨 갱신마다 바꾸면 초당 두 번 교체된다 */
let menuState: MenuState | null = null
/** 상시 1초 타이머는 유휴 상태에서도 CPU를 깨운다 → 녹음·받아쓰기 중에만 돌린다 */
let titleTimer: NodeJS.Timeout | null = null
/** 타이머가 계산에 쓰는 기준 시각·기호. 재개로 바뀌면 타이머를 다시 건다 */
let titleStartedAt: number | null = null
let titleMark: string | null = null

const trayIconPath = () =>
  is.dev
    ? join(app.getAppPath(), 'resources', TRAY_ICON_FILE)
    : join(process.resourcesPath, 'app.asar.unpacked', 'resources', TRAY_ICON_FILE)

const pad2 = (value: number) => String(value).padStart(2, '0')

/** 메뉴바는 폭이 좁아 한 시간 미만이면 m:ss로 짧게 쓴다 */
const formatElapsed = (elapsedMs: number) => {
  const total = Math.max(0, Math.floor(elapsedMs / MS_PER_SEC))
  const minutes = Math.floor(total / SECONDS_PER_MINUTE)
  const seconds = total % SECONDS_PER_MINUTE

  if (minutes < MINUTES_PER_HOUR) return `${minutes}:${pad2(seconds)}`

  return `${Math.floor(minutes / MINUTES_PER_HOUR)}:${pad2(minutes % MINUTES_PER_HOUR)}:${pad2(seconds)}`
}

const buildMenu = ({ isRecording, isDictating, hasLastDictation }: MenuState) => {
  const { tray: labels } = t().main

  return Menu.buildFromTemplate([
    {
      label: isRecording ? labels.stopRecording : labels.startRecording,
      // 받아쓰기 중에는 녹음을 시작할 수 없다. 메뉴를 비활성으로 두어 안내 문구만 뜨는 일을 줄인다
      enabled: !isDictating,
      click: () => requestRecordingCommand({ kind: isRecording ? 'stop' : 'start' })
    },
    {
      label: isDictating ? labels.stopDictation : labels.startDictation,
      enabled: !isRecording,
      click: () => controlDictation({ kind: isDictating ? 'stop' : 'start' })
    },
    // 삽입이 실패했거나 다른 곳에 들어갔을 때 마지막 세션 전체를 클립보드로 되살린다
    {
      label: labels.copyLastDictation,
      enabled: hasLastDictation,
      click: () => copyLastDictation()
    },
    { label: labels.toggleWidget, click: toggleWidgetVisible },
    { type: 'separator' },
    { label: labels.openMainWindow, click: () => showMainWindow() },
    { type: 'separator' },
    { label: labels.quit, click: () => app.quit() }
  ])
}

const setTitle = (title: string) => {
  // setTitle은 macOS 전용이다. 다른 플랫폼에서는 아이콘만 남는다
  if (process.platform === 'darwin') tray?.setTitle(title)
}

const stopTitleTimer = () => {
  if (!titleTimer) return

  clearInterval(titleTimer)
  titleTimer = null
}

const isSameMenuState = (a: MenuState | null, b: MenuState) =>
  a !== null &&
  a.isRecording === b.isRecording &&
  a.isDictating === b.isDictating &&
  a.hasLastDictation === b.hasLastDictation &&
  a.locale === b.locale

/** 흐르는 시간을 보이는 쪽(녹음 또는 받아쓰기)의 기준 시각으로 1초 타이머를 건다 (청크마다 불린다) */
const runTitleTimer = ({ mark, startedAt }: { mark: string; startedAt: number }) => {
  setTitle(`${mark} ${formatElapsed(Date.now() - startedAt)}`)
  // 재개하면 startedAt이 바뀌므로 그때만 타이머를 새 값으로 다시 건다
  if (titleTimer && titleStartedAt === startedAt && titleMark === mark) return

  stopTitleTimer()
  titleStartedAt = startedAt
  titleMark = mark
  titleTimer = setInterval(
    () => setTitle(`${mark} ${formatElapsed(Date.now() - startedAt)}`),
    TITLE_TICK_MS
  )
}

/** 녹음·받아쓰기 상태가 바뀔 때마다 메뉴 문구와 시간 표시를 맞춘다. 둘은 동시에 돌지 않는다 */
export const refreshTray = () => {
  if (!tray) return

  const { startedAt, pausedAt } = getRecordingState()
  const dictation = getDictationState()
  const next: MenuState = {
    isRecording: startedAt !== null,
    isDictating: dictation.startedAt !== null,
    hasLastDictation: dictation.hasLastResult,
    locale: getLocale()
  }

  if (!isSameMenuState(menuState, next)) {
    menuState = next
    tray.setContextMenu(buildMenu(next))
  }

  if (dictation.startedAt !== null) {
    runTitleTimer({ mark: DICTATION_MARK, startedAt: dictation.startedAt })

    return
  }

  if (startedAt === null) {
    stopTitleTimer()
    setTitle('')

    return
  }

  // 일시정지하면 시간이 멈추므로 타이머를 세우고 멈춘 시각을 그대로 둔다
  if (pausedAt !== null) {
    stopTitleTimer()
    setTitle(`${PAUSED_MARK} ${formatElapsed(pausedAt - startedAt)}`)

    return
  }

  runTitleTimer({ mark: RECORDING_MARK, startedAt })
}

/** 아이콘을 읽지 못해도 앱은 뜬다 — 트레이가 없으면 패널과 단축키로 모든 동작을 할 수 있다 */
export const createTray = () => {
  try {
    const icon = nativeImage.createFromPath(trayIconPath())
    if (icon.isEmpty()) throw new Error(`tray icon unreadable (${trayIconPath()})`)

    icon.setTemplateImage(true)
    tray = new Tray(icon)
    tray.setToolTip('meeting-stt')
    refreshTray()
  } catch (caught) {
    warn(`메뉴바 아이콘을 만들지 못했습니다: ${messageOf(caught)}`)
  }
}

export const destroyTray = () => {
  stopTitleTimer()
  tray?.destroy()
  tray = null
}
