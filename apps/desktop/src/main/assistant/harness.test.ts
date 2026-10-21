import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HARNESS_FILES, HARNESS_SKILL_NAMES, installHarness } from './harness'
import { parseSkillFrontmatter } from './skillFrontmatter'

vi.mock('../log', () => ({ info: vi.fn() }))

/** Codex가 프로젝트 문서를 합쳐 읽는 기본 한도 (project_doc_max_bytes) */
const CODEX_DOC_MAX_BYTES = 32 * 1024

const contentOf = (filePath: string) =>
  HARNESS_FILES.find((file) => file.path === filePath)?.content

let folder = ''

beforeEach(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), 'harness-'))
})

afterEach(async () => {
  await rm(folder, { recursive: true, force: true })
})

describe('installHarness', () => {
  it('빈 폴더에 템플릿 파일과 스킬 링크, raw 폴더를 만든다', async () => {
    expect(await installHarness({ folder })).toBe(true)

    for (const file of HARNESS_FILES) {
      expect(await readFile(path.join(folder, file.path), 'utf8')).toBe(file.content)
    }
    for (const name of HARNESS_SKILL_NAMES) {
      const link = path.join(folder, '.claude', 'skills', name)
      expect((await lstat(link)).isSymbolicLink()).toBe(true)
      expect(await readFile(path.join(link, 'SKILL.md'), 'utf8')).toBe(
        contentOf(path.join('.agents', 'skills', name, 'SKILL.md'))
      )
    }
    expect((await lstat(path.join(folder, 'raw'))).isDirectory()).toBe(true)
  })

  it.each(['CLAUDE.md', 'AGENTS.md'])('%s가 있으면 아무것도 넣지 않는다', async (ruleFile) => {
    await writeFile(path.join(folder, ruleFile), '내 규칙')

    expect(await installHarness({ folder })).toBe(false)

    expect(await readdir(folder)).toEqual([ruleFile])
  })

  it('이미 있는 파일과 스킬 폴더는 덮지 않는다', async () => {
    const mySkillDir = path.join(folder, '.claude', 'skills', 'todo')
    await mkdir(mySkillDir, { recursive: true })
    await writeFile(path.join(mySkillDir, 'SKILL.md'), '내 스킬')
    await writeFile(path.join(folder, 'tasks.md'), '내 할 일')

    await installHarness({ folder })

    expect(await readFile(path.join(folder, 'tasks.md'), 'utf8')).toBe('내 할 일')
    expect(await readFile(path.join(mySkillDir, 'SKILL.md'), 'utf8')).toBe('내 스킬')
    expect(await readFile(path.join(folder, 'AGENTS.md'), 'utf8')).toBe(contentOf('AGENTS.md'))
  })
})

describe('하네스 템플릿', () => {
  it('스킬은 문서에 정한 8개다', () => {
    expect(HARNESS_SKILL_NAMES.toSorted()).toEqual(
      [
        'draft',
        'profile',
        'recording',
        'retrospective',
        'style',
        'todo',
        'wiki',
        'project'
      ].toSorted()
    )
  })

  it.each(HARNESS_SKILL_NAMES)('%s 스킬 머리말의 이름이 폴더 이름과 같고 설명이 있다', (name) => {
    const skill = parseSkillFrontmatter(
      contentOf(path.join('.agents', 'skills', name, 'SKILL.md')) ?? ''
    )

    expect(skill.name).toBe(name)
    expect(skill.description).not.toBe('')
    // `/` 메뉴의 머리말 해석기는 이스케이프를 풀지 않는다 — 설명은 작은따옴표로 감싼다
    expect(skill.description).not.toContain('\\')
  })

  it('AGENTS.md는 Codex가 한 번에 읽는 크기 안이다', () => {
    expect(Buffer.byteLength(contentOf('AGENTS.md') ?? '')).toBeLessThan(CODEX_DOC_MAX_BYTES)
  })

  it('AGENTS.md가 가리키는 스킬은 모두 있고, 모든 스킬을 가리킨다', () => {
    const named = new Set(
      [...(contentOf('AGENTS.md') ?? '').matchAll(/`([a-z]+)` 스킬/g)].map((match) => match[1])
    )

    expect([...named].toSorted()).toEqual(HARNESS_SKILL_NAMES.toSorted())
  })
})
