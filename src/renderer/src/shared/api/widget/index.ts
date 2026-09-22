import type { SetWidgetVisibleRequest } from '@shared/ipc'

/**
 * @description 녹음 위젯 패널을 보이거나 숨깁니다. 창 자체는 오디오 그래프 소유자라 닫히지 않습니다.
 * @param isVisible - 표시 여부
 * @returns 없음
 * @example
 * await setWidgetVisibleApi({ isVisible: false })
 */
export const setWidgetVisibleApi = async ({ isVisible }: SetWidgetVisibleRequest) => {
  await window.api.widget.setVisible({ isVisible })
}
