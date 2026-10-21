export interface FileTreeNode {
  name: string
  /** 작업 폴더 기준 상대 경로. 폴더는 끝에 `/`가 없다 */
  path: string
  /** 폴더면 하위 항목, 파일이면 null */
  children: FileTreeNode[] | null
}
