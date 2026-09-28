import { nativeTheme } from 'electron'
import type { ThemePreference } from '@shared/types'

/** 모든 창의 `prefers-color-scheme`과 위젯 패널의 vibrancy 재질이 이 값을 따른다 */
export const applyTheme = (theme: ThemePreference) => {
  nativeTheme.themeSource = theme
}
