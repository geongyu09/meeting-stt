import { lstat, mkdir, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { info } from '../log'

/**
 * 기본 하네스 (references/features/assistant.md "기본 하네스").
 * 규칙 파일이 없는 작업 폴더에 문서 위치·요청별 행동 규칙과 스킬을 넣는다. 이미 있는 파일은 덮지 않는다.
 */

// 템플릿을 main 번들에 문자열로 넣어 패키징 설정(extraResources·asarUnpack)을 건드리지 않는다
const TEMPLATES = import.meta.glob<string>('./harness/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
})

const TEMPLATE_PREFIX = './harness/'
const SKILL_TEMPLATE_PATTERN = /^skills\/([^/]+)\/SKILL\.md$/
const RULE_FILES = ['CLAUDE.md', 'AGENTS.md']
const CODEX_SKILLS_DIR = path.join('.agents', 'skills')
const CLAUDE_SKILLS_DIR = path.join('.claude', 'skills')
const EMPTY_DIRS = ['raw']

const templateEntries = Object.entries(TEMPLATES).map(([key, content]) => ({
  templatePath: key.slice(TEMPLATE_PREFIX.length),
  content
}))

/** 스킬 이름 목록. 템플릿의 `skills/<이름>/SKILL.md`에서 꺼낸다 */
export const HARNESS_SKILL_NAMES = templateEntries
  .map(({ templatePath }) => SKILL_TEMPLATE_PATTERN.exec(templatePath)?.[1])
  .filter((name) => name !== undefined)

/** 작업 폴더 기준 경로와 내용. 템플릿에는 점 폴더를 두지 않아 스킬은 Codex가 읽는 `.agents/skills`로 옮겨 쓴다 */
export const HARNESS_FILES = templateEntries.map(({ templatePath, content }) => ({
  path: SKILL_TEMPLATE_PATTERN.test(templatePath)
    ? path.join('.agents', templatePath)
    : templatePath,
  content
}))

const isExistError = (caught: unknown) =>
  caught instanceof Error && 'code' in caught && caught.code === 'EEXIST'

/** 이미 있으면 그대로 둔다. 확인 후 쓰기 대신 `wx`·`EEXIST`로 판단해 그 사이에 생긴 파일도 덮지 않는다 */
const keepExisting = (caught: unknown) => {
  if (!isExistError(caught)) throw caught
}

const writeIfMissing = async ({
  folder,
  file
}: {
  folder: string
  file: (typeof HARNESS_FILES)[number]
}) => {
  const target = path.join(folder, file.path)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, file.content, { flag: 'wx' }).catch(keepExisting)
}

/** 상대 경로 링크라 작업 폴더를 옮겨도 깨지지 않는다 */
const linkSkillIfMissing = async ({ folder, name }: { folder: string; name: string }) => {
  const link = path.join(folder, CLAUDE_SKILLS_DIR, name)
  await mkdir(path.dirname(link), { recursive: true })
  await symlink(path.join('..', '..', CODEX_SKILLS_DIR, name), link, 'dir').catch(keepExisting)
}

const hasRuleFile = async (folder: string) => {
  const found = await Promise.all(
    RULE_FILES.map((name) =>
      lstat(path.join(folder, name)).then(
        () => true,
        () => false
      )
    )
  )

  return found.some(Boolean)
}

/**
 * 규칙 파일(`CLAUDE.md`·`AGENTS.md`)이 둘 다 없을 때만 기본 하네스를 넣는다. 넣었으면 true, 건너뛰었으면 false.
 * 하나라도 있으면 사용자가 만든 하네스다 — 한쪽에만 기본 규칙이 들어가면 Claude Code와 Codex가 다른 규칙으로 돈다.
 */
export const installHarness = async ({ folder }: { folder: string }) => {
  if (await hasRuleFile(folder)) return false

  await Promise.all(HARNESS_FILES.map((file) => writeIfMissing({ folder, file })))
  await Promise.all(HARNESS_SKILL_NAMES.map((name) => linkSkillIfMissing({ folder, name })))
  await Promise.all(EMPTY_DIRS.map((dir) => mkdir(path.join(folder, dir), { recursive: true })))
  info(`기본 하네스를 넣었습니다: ${folder}`)
  return true
}
