import type { FileTreeNode } from '../types/fileTree'

interface TreeOfParams {
  paths: string[]
  prefix: string
}

const byName = (a: FileTreeNode, b: FileTreeNode) => a.name.localeCompare(b.name)

// 재귀라 리턴 타입을 추론하지 못한다
const treeOf = ({ paths, prefix }: TreeOfParams): FileTreeNode[] => {
  const files = paths
    .filter((p) => !p.includes('/'))
    .map((name) => ({ name, path: prefix + name, children: null }))
  const folderNames = new Set(paths.filter((p) => p.includes('/')).map((p) => p.split('/')[0]))
  const folders = [...folderNames].map((name) => ({
    name,
    path: prefix + name,
    children: treeOf({
      paths: paths.filter((p) => p.startsWith(`${name}/`)).map((p) => p.slice(name.length + 1)),
      prefix: `${prefix}${name}/`
    })
  }))

  return [...folders.toSorted(byName), ...files.toSorted(byName)]
}

/** `/`로 나눈 상대 경로 목록을 폴더 먼저·이름순 트리로 만든다 */
export const fileTreeOf = (paths: string[]) => treeOf({ paths, prefix: '' })
