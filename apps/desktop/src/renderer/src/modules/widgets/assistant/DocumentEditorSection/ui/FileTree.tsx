import Icon from '@renderer/shared/components/primitives/ui/Icon'

import type { FileTreeNode } from '../types/fileTree'
import styles from './FileTree.module.css'

const ICON_SIZE = 14

interface FileTreeProps {
  nodes: FileTreeNode[]
  expandedPaths: ReadonlySet<string>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}

/** 작업 폴더의 문서 트리. 폴더는 눌러 접고 펴고, 파일은 눌러 연다 */
export default function FileTree({ nodes, expandedPaths, onToggle, onOpen }: FileTreeProps) {
  return (
    <ul className={styles.list}>
      {nodes.map((node) => {
        const isExpanded = expandedPaths.has(node.path)

        return (
          <li key={node.path}>
            {node.children ? (
              <button
                type="button"
                className={styles.row}
                aria-expanded={isExpanded}
                onClick={() => onToggle(node.path)}
              >
                <span className={styles.chevron}>
                  <Icon name="chevronDown" size={ICON_SIZE} />
                </span>
                <Icon name="folder" size={ICON_SIZE} />
                <span className={styles.name}>{node.name}</span>
              </button>
            ) : (
              <button type="button" className={styles.row} onClick={() => onOpen(node.path)}>
                <span className={styles.chevron} />
                <Icon name="file" size={ICON_SIZE} />
                <span className={styles.name}>{node.name}</span>
              </button>
            )}
            {node.children && isExpanded ? (
              <FileTree
                nodes={node.children}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
