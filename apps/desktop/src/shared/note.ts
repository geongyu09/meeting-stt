/**
 * 녹음 노트의 순수 로직 — 링크 뽑기, 프롬프트에 넣을 길이 자르기
 * (references/features/recording.md "녹음 노트").
 */

/** 저장 상한. 넘을 일이 없는 크기이고 신뢰 경계(IPC 핸들러)에서만 검사한다 */
export const NOTE_MAX_CHARS = 100_000

// shortcut: 괄호를 URL에서 빼 `[글](https://…)`의 닫는 괄호를 떼어 낸다. 괄호가 든 URL(위키백과 등)은 괄호 앞에서 잘린다 — 실제로 문제가 되면 괄호 짝 맞추기로 바꾼다
const URL_PATTERN = /https:\/\/[^\s<>()[\]"'`]+/g
const TRAILING_PUNCTUATION = /[.,;:!?。、]+$/

const isValidUrl = (value: string) => {
  try {
    return Boolean(new URL(value).hostname)
  } catch {
    return false
  }
}

/**
 * @description 노트에서 `https://` 링크를 등장 순서대로 중복 없이 뽑습니다. 맨 URL과 마크다운 링크 모두 읽고, 문장 끝 구두점은 뗍니다.
 * @param note - 노트 원문
 * @returns 링크 배열. `http:` 등 다른 스킴은 앱이 열지 않으므로 넣지 않는다
 * @example
 * extractNoteLinks('안건 [문서](https://notion.so/a), https://figma.com/b.') // ['https://notion.so/a', 'https://figma.com/b']
 */
export const extractNoteLinks = (note: string) => [
  ...new Set(
    (note.match(URL_PATTERN) ?? [])
      .map((url) => url.replace(TRAILING_PUNCTUATION, ''))
      .filter(isValidUrl)
  )
]

const CLIPPED_MARK = '\n…(노트가 길어 뒷부분을 생략했습니다)'

/**
 * @description 프롬프트에 넣을 노트를 다듬습니다. 앞뒤 공백을 걷고, 길면 `maxChars`에서 자른 뒤 생략 표시를 붙입니다.
 * @param note - 노트 원문
 * @param maxChars - 넣을 최대 글자 수 (생략 표시 제외)
 * @returns 다듬은 노트. 비어 있으면 빈 문자열이다
 * @example
 * const section = clipNote({ note, maxChars: 4000 })
 */
export const clipNote = ({ note, maxChars }: { note: string; maxChars: number }) => {
  const trimmed = note.trim()

  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}${CLIPPED_MARK}`
}
