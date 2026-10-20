import { describe, expect, it } from 'vitest'

import { isInsideFolder, resolveWorkspaceFile, toWorkspaceRelative } from './workspacePath'

const ROOT = '/Users/me/notes'

describe('resolveWorkspaceFile', () => {
  it('폴더 안의 .md 상대 경로를 절대 경로로 바꾼다', () => {
    expect(resolveWorkspaceFile({ root: ROOT, relativePath: 'daily/2026-10-20.md' })).toEqual({
      filePath: '/Users/me/notes/daily/2026-10-20.md'
    })
  })

  it('확장자는 대소문자를 가리지 않는다', () => {
    expect(resolveWorkspaceFile({ root: ROOT, relativePath: 'README.MD' })).toEqual({
      filePath: '/Users/me/notes/README.MD'
    })
  })

  it('폴더 밖을 가리키는 경로는 거절한다', () => {
    expect(resolveWorkspaceFile({ root: ROOT, relativePath: '../secret.md' })).toEqual({
      problem: 'outsideFolder'
    })
    expect(resolveWorkspaceFile({ root: ROOT, relativePath: 'a/../../notes2/x.md' })).toEqual({
      problem: 'outsideFolder'
    })
    expect(resolveWorkspaceFile({ root: ROOT, relativePath: '/etc/hosts.md' })).toEqual({
      problem: 'outsideFolder'
    })
  })

  it('.md가 아니면 거절한다', () => {
    expect(resolveWorkspaceFile({ root: ROOT, relativePath: '.claude/settings.json' })).toEqual({
      problem: 'notMarkdown'
    })
  })

  it('점 두 개로 시작하는 이름의 파일은 폴더 안으로 본다', () => {
    expect(resolveWorkspaceFile({ root: ROOT, relativePath: '..draft.md' })).toEqual({
      filePath: '/Users/me/notes/..draft.md'
    })
  })
})

describe('isInsideFolder', () => {
  it('폴더 자신과 이름이 겹치는 형제 폴더는 안으로 보지 않는다', () => {
    expect(isInsideFolder({ root: ROOT, target: ROOT })).toBe(false)
    expect(isInsideFolder({ root: ROOT, target: '/Users/me/notes-old/a.md' })).toBe(false)
  })
})

describe('toWorkspaceRelative', () => {
  it('폴더 안이면 상대 경로, 밖이면 절대 경로 그대로 돌려준다', () => {
    expect(toWorkspaceRelative({ roots: [ROOT], filePath: '/Users/me/notes/a/b.md' })).toBe(
      'a/b.md'
    )
    expect(toWorkspaceRelative({ roots: [ROOT], filePath: '/tmp/b.md' })).toBe('/tmp/b.md')
  })

  it('심볼릭 링크를 푼 실제 폴더 경로로도 찾는다', () => {
    expect(
      toWorkspaceRelative({ roots: ['/tmp/w', '/private/tmp/w'], filePath: '/private/tmp/w/a.md' })
    ).toBe('a.md')
  })

  it('명령처럼 절대 경로가 아닌 값은 그대로 둔다', () => {
    expect(toWorkspaceRelative({ roots: [ROOT], filePath: 'git status' })).toBe('git status')
  })
})
