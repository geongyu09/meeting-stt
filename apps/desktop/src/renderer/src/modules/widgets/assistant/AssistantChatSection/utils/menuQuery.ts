export interface MenuQuery {
  kind: 'command' | 'file'
  /** 여는 글자(`/`·`@`) 뒤의 글 */
  query: string
  /** 토큰이 시작하는 위치. 고른 값으로 바꿀 때 쓴다 */
  start: number
}

/**
 * 입력 끝의 토큰이 메뉴를 열어야 하는지 봅니다. 글 맨 앞의 `/`는 명령, 어디든 `@`는 파일이다.
 * 커서는 늘 끝에 있다고 본다 — 중간을 고치는 동안에는 메뉴가 끝 토큰을 따라간다.
 * @example
 * menuQueryOf('/wi') // { kind: 'command', query: 'wi', start: 0 }
 * menuQueryOf('정리해줘 @meet') // { kind: 'file', query: 'meet', start: 5 }
 * menuQueryOf('/wiki-review 오늘') // null
 */
export const menuQueryOf = (text: string): MenuQuery | null => {
  const start = Math.max(text.lastIndexOf(' '), text.lastIndexOf('\n')) + 1
  const token = text.slice(start)
  if (token.startsWith('@')) return { kind: 'file', query: token.slice(1), start }
  if (start === 0 && token.startsWith('/')) return { kind: 'command', query: token.slice(1), start }

  return null
}

/**
 * 끝 토큰을 고른 값으로 바꾸고 공백을 하나 붙여 다음 글을 바로 잇게 합니다.
 * @example
 * replaceMenuToken({ text: '정리해줘 @meet', start: 5, replacement: '@meetings/a.md' }) // '정리해줘 @meetings/a.md '
 */
export const replaceMenuToken = ({
  text,
  start,
  replacement
}: {
  text: string
  start: number
  replacement: string
}) => `${text.slice(0, start)}${replacement} `

/**
 * 대소문자를 가리지 않고 어느 한 칸에라도 들어 있으면 남깁니다. 빈 검색어는 전부 남긴다.
 * @example
 * matchesQuery({ query: 'wiki', fields: ['wiki-review', '복습'] }) // true
 */
export const matchesQuery = ({ query, fields }: { query: string; fields: string[] }) => {
  const needle = query.toLowerCase()

  return needle === '' || fields.some((field) => field.toLowerCase().includes(needle))
}

/**
 * 파일 경로들에서 폴더 경로(`a/`, `a/b/`)를 중복 없이 사전순으로 뽑습니다. 폴더 전체를 붙이는 줄에 쓴다.
 * @example
 * folderPathsOf(['a/b/c.md', 'a/d.md', 'e.md']) // ['a/', 'a/b/']
 */
export const folderPathsOf = (files: string[]) => {
  const folders = new Set<string>()
  for (const file of files) {
    const parts = file.split('/').slice(0, -1)
    parts.forEach((_, index) => folders.add(`${parts.slice(0, index + 1).join('/')}/`))
  }

  return [...folders].toSorted((a, b) => a.localeCompare(b))
}
