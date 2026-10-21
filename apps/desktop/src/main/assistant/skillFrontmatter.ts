/** `---`로 감싼 YAML 머리말. 본문이 없는 파일도 있어 닫는 줄까지만 본다 */
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/

/** `>`·`|`(접기·그대로) 블록 스칼라의 시작 표시 */
const BLOCK_SCALAR_PATTERN = /^[>|][+-]?$/

const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, '$2')

/** 들여쓴 다음 줄들이 블록 스칼라의 본문이다. 줄을 공백 하나로 잇는다 */
const blockScalarOf = (lines: string[], start: number) => {
  const body: string[] = []
  for (const line of lines.slice(start)) {
    if (!/^\s+\S/.test(line)) break
    body.push(line.trim())
  }

  return body.join(' ')
}

const fieldOf = ({ lines, key }: { lines: string[]; key: string }) => {
  const index = lines.findIndex((line) => line.startsWith(`${key}:`))
  if (index < 0) return ''

  const value = lines[index].slice(key.length + 1).trim()
  return BLOCK_SCALAR_PATTERN.test(value) ? blockScalarOf(lines, index + 1) : unquote(value)
}

/**
 * SKILL.md 머리말에서 `name`·`description`을 꺼냅니다. YAML 파서 없이 두 키만 본다 — 스킬 머리말은 그 둘이면 충분하다.
 * @example
 * parseSkillFrontmatter('---\nname: wiki-review\ndescription: 복습\n---\n# ...') // { name: 'wiki-review', description: '복습' }
 */
export const parseSkillFrontmatter = (text: string) => {
  const block = FRONTMATTER_PATTERN.exec(text)?.[1] ?? ''
  const lines = block.split(/\r?\n/)

  return {
    name: fieldOf({ lines, key: 'name' }) || null,
    description: fieldOf({ lines, key: 'description' })
  }
}
