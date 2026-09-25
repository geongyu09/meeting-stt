import { DEFAULT_LOCALE, getMessages, type Locale } from '@shared/i18n'

/**
 * main이 만드는 사용자 문구(메뉴바·대화상자·renderer가 그대로 보여 주는 오류)의 언어
 * (references/architecture.md "UI 언어"). DB를 직접 읽지 않고 앱 시작·`settings:update`가 넣어 준 값을 든다 —
 * 순수 로직(파이프라인·업데이트 결과 해석)이 오류 문구 하나 때문에 DB·electron에 묶이면 단위 테스트가 깨진다.
 * 값을 넣기 전(단위 테스트)에는 기본 언어다.
 */
let currentLocale: Locale = DEFAULT_LOCALE

export const setCurrentLocale = (locale: Locale) => {
  currentLocale = locale
}

export const getLocale = () => currentLocale

export const t = () => getMessages(currentLocale)
