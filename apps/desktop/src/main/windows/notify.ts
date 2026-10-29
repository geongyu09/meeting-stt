import { Notification } from 'electron'
import { info } from '../log'

import { showMainWindow } from './main'

/** 참조를 놓으면 알림 객체가 GC돼 클릭 핸들러가 사라진다. 누르거나 닫힐 때까지 쥐고 있는다 */
const shownNotifications = new Set<Notification>()

const NOTIFICATION_BODY_MAX_CHARS = 120

/** 답변 글을 알림 본문 한 줄로 줄인다 (루틴·채팅 답변 알림) */
export const notificationSummaryOf = (text: string) =>
  text.replace(/\s+/g, ' ').trim().slice(0, NOTIFICATION_BODY_MAX_CHARS)

/**
 * macOS 시스템 알림. 누르면 메인 창을 앞으로 가져온다 (references/features/assistant.md "루틴" > "알림").
 * 알림 권한은 macOS가 처음 보낼 때 묻는다.
 */
export const showNotification = ({
  title,
  body,
  onClick
}: {
  title: string
  body: string
  /** 창을 띄운 뒤 할 일 (정리 알림은 원문을 연다) */
  onClick?: () => void
}) => {
  if (!Notification.isSupported()) {
    info(`알림을 지원하지 않아 건너뜁니다: ${title}`)
    return
  }

  const notification = new Notification({ title, body })
  const release = () => shownNotifications.delete(notification)
  notification.on('click', () => {
    release()
    showMainWindow()
    onClick?.()
  })
  notification.on('close', release)
  shownNotifications.add(notification)
  notification.show()
}
