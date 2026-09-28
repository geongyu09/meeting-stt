/**
 * 화면 테마. main이 `nativeTheme.themeSource`에 그대로 넣고, 창들은 `prefers-color-scheme`으로 따라간다
 * (references/architecture.md "다크 모드").
 */
export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark']
export const DEFAULT_THEME: ThemePreference = 'system'

export const isThemePreference = (value: unknown): value is ThemePreference =>
  typeof value === 'string' && (THEME_PREFERENCES as string[]).includes(value)
