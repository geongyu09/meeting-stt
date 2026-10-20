import path from 'node:path'

/**
 * 작업 폴더 경로 계산 (references/architecture.md "개인 비서 모드" > "문서 에디터").
 * electron·fs에 의존하지 않는 순수 함수라 vitest로 검증한다. 심볼릭 링크 확인(realpath)은 files.ts가 한다.
 */

export const MARKDOWN_EXTENSION = '.md'

export const isMarkdownPath = (filePath: string) =>
  path.extname(filePath).toLowerCase() === MARKDOWN_EXTENSION

/**
 * @description target이 root 안(root 자신 제외)에 있는지 봅니다. 둘 다 절대 경로여야 한다.
 * @example
 * isInsideFolder({ root: '/w', target: '/w/a.md' }) // true
 * isInsideFolder({ root: '/w', target: '/w2/a.md' }) // false
 */
export const isInsideFolder = ({ root, target }: { root: string; target: string }) => {
  const relative = path.relative(root, target)

  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

/**
 * @description renderer가 보낸 상대 경로를 작업 폴더 안의 .md 절대 경로로 바꿉니다.
 * 절대 경로·폴더 밖(`..`)·.md가 아닌 경로는 이유와 함께 거절한다.
 * @example
 * resolveWorkspaceFile({ root: '/w', relativePath: 'notes/a.md' }) // { filePath: '/w/notes/a.md' }
 * resolveWorkspaceFile({ root: '/w', relativePath: '../a.md' }) // { problem: 'outsideFolder' }
 */
export const resolveWorkspaceFile = ({
  root,
  relativePath
}: {
  root: string
  relativePath: string
}) => {
  if (path.isAbsolute(relativePath)) return { problem: 'outsideFolder' as const }

  const filePath = path.resolve(root, relativePath)
  if (!isInsideFolder({ root, target: filePath })) return { problem: 'outsideFolder' as const }
  if (!isMarkdownPath(filePath)) return { problem: 'notMarkdown' as const }

  return { filePath }
}

/**
 * @description 에이전트가 다룬 경로를 화면용으로 바꿉니다. 작업 폴더 안의 절대 경로면 `/`로 이은 상대 경로, 아니면 그대로.
 * 폴더 경로에 심볼릭 링크가 끼면(`/tmp` → `/private/tmp`) CLI가 실제 경로를 쓸 수 있어 폴더 경로를 여럿 받는다.
 * @example
 * toWorkspaceRelative({ roots: ['/w'], filePath: '/w/notes/a.md' }) // 'notes/a.md'
 * toWorkspaceRelative({ roots: ['/w'], filePath: '/tmp/a.md' }) // '/tmp/a.md'
 */
export const toWorkspaceRelative = ({ roots, filePath }: { roots: string[]; filePath: string }) => {
  if (!path.isAbsolute(filePath)) return filePath

  const root = roots.find((candidate) => isInsideFolder({ root: candidate, target: filePath }))
  return root ? path.relative(root, filePath).split(path.sep).join('/') : filePath
}
