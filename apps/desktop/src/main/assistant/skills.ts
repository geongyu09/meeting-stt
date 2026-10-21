import { readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AssistantSkill } from '@shared/types'

import { parseSkillFrontmatter } from './skillFrontmatter'

/**
 * `/` 명령 메뉴에 보여 줄 스킬 목록 (references/features/ui.md "채팅창 리뉴얼" > "IPC").
 * 작업 폴더와 사용자 홈의 `.claude/skills/<이름>/SKILL.md`만 본다. 플러그인 스킬·`.claude/commands`는 보지 않는다.
 */

const SKILLS_DIR = path.join('.claude', 'skills')

/** 스킬 폴더는 심볼릭 링크일 때가 많아 종류를 가리지 않고 SKILL.md를 읽어 본다 */
const readSkillsIn = async (root: string): Promise<AssistantSkill[]> => {
  const dir = path.join(root, SKILLS_DIR)
  const names = await readdir(dir).catch(() => [])
  const skills = await Promise.all(
    names.map(async (dirName) => {
      const text = await readFile(path.join(dir, dirName, 'SKILL.md'), 'utf8').catch(() => null)
      if (text === null) return null

      const { name, description } = parseSkillFrontmatter(text)
      return { name: name ?? dirName, description }
    })
  )

  return skills.filter((skill) => skill !== null)
}

/** 같은 이름이면 작업 폴더 쪽이 이긴다 — Claude Code도 프로젝트 스킬을 먼저 본다 */
export const listAssistantSkills = async ({ folder }: { folder: string }) => {
  const [folderSkills, userSkills] = await Promise.all([
    readSkillsIn(folder),
    readSkillsIn(os.homedir())
  ])
  const byName = new Map<string, AssistantSkill>()
  for (const skill of [...folderSkills, ...userSkills]) {
    if (!byName.has(skill.name)) byName.set(skill.name, skill)
  }

  return [...byName.values()].toSorted((a, b) => a.name.localeCompare(b.name))
}
