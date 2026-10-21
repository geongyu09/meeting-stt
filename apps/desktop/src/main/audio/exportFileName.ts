// macOS Finder가 막는 `:`·`/`와, 다른 곳으로 옮겼을 때 문제가 되는 문자·제어 문자를 함께 바꾼다
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS_PATTERN = /[\u0000-\u001f\\/:*?"<>|]/g
const FILE_NAME_MAX_LENGTH = 120
const FALLBACK_NAME = '회의 녹음'
const WAV_EXTENSION = '.wav'

/** 파일명에 못 쓰는 문자를 `_`로 바꾼다. 뇌 원문 파일 이름도 같은 규칙이다 (assistant/recordNote.ts) */
export const toSafeFileName = (name: string) =>
  name
    .replace(UNSAFE_CHARS_PATTERN, '_')
    .trim()
    // 점으로 시작하면 Finder에서 숨김 파일이 된다
    .replace(/^\.+/, '')

/** 저장 대화상자의 기본 파일명 */
export const toExportFileName = (title: string) => {
  const base = toSafeFileName(title).slice(0, FILE_NAME_MAX_LENGTH).trim()

  return `${base || FALLBACK_NAME}${WAV_EXTENSION}`
}
