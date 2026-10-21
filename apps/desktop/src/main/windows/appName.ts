import { app, Menu } from 'electron'

export const APP_DISPLAY_NAME = 'Gyeot'

/**
 * package.json name(meeting-stt)은 userData 폴더와 키체인 항목을 정하므로 두고, 화면 이름만 ready 뒤에 바꾼다.
 * ready 전에 바꾸면 키체인 항목 이름이 바뀌어 저장된 API 키를 못 읽고, 기본 메뉴는 옛 이름으로 이미 만들어져 있어
 * 같은 role로 다시 만든다 (references/pitfalls.md "빌드 / 배포").
 */
export const applyAppDisplayName = () => {
  app.setName(APP_DISPLAY_NAME)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ])
  )
}
