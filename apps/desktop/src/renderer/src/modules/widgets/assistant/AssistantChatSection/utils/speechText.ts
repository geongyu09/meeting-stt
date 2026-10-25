/** 닫히지 않은 코드 블록은 끝까지 뺀다. 코드는 소리로 들어도 뜻이 없다 */
const FENCED_CODE = /(```|~~~)[\s\S]*?(\1|$)/g
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g
const LINK = /\[([^\]]+)\]\([^)]*\)/g
const HEADING_MARK = /^#{1,6}\s+/gm
const QUOTE_MARK = /^\s*>\s?/gm
const RULE_LINE = /^\s*([-*_]\s*){3,}$/gm
const TABLE_DIVIDER = /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/gm
const LIST_MARK = /^\s*([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/gm
/** `~` 하나는 "3~5일" 같은 범위라 지우지 않는다 */
const INLINE_MARK = /\*+|~~|`/g

/**
 * 답변 마크다운을 읽어줄 글로 바꾼다 — 코드 블록은 빼고, 기호는 지우고, 링크·이미지는 글자만 남긴다.
 * @example
 * speechTextOf('## 요약\n- **할 일** [문서](a.md)') // '요약\n할 일 문서'
 */
export const speechTextOf = (markdown: string) =>
  markdown
    .replace(FENCED_CODE, '')
    .replace(IMAGE, '$1')
    .replace(LINK, '$1')
    .replace(HEADING_MARK, '')
    .replace(QUOTE_MARK, '')
    .replace(RULE_LINE, '')
    .replace(TABLE_DIVIDER, '')
    .replace(LIST_MARK, '')
    .replace(INLINE_MARK, '')
    .replace(/\|/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n\s*/g, '\n')
    .trim()
