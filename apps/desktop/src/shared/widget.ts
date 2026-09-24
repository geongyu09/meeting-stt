/** 위젯 반투명 범위. 설정 슬라이더와 main의 저장 검증이 같은 값을 쓴다 (references/data-model.md) */
export const MIN_WIDGET_FADE_OPACITY = 0.2
export const MAX_WIDGET_FADE_OPACITY = 0.95
export const WIDGET_FADE_OPACITY_STEP = 0.05
export const DEFAULT_WIDGET_FADE_OPACITY = 0.55

export const isWidgetFadeOpacity = (value: unknown): value is number =>
  typeof value === 'number' && value >= MIN_WIDGET_FADE_OPACITY && value <= MAX_WIDGET_FADE_OPACITY
