import type { OrganizeStatus } from '@shared/types'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { isOpenableFile } from '@renderer/shared/utils/isOpenableFile'

import styles from './BrainFiles.module.css'

interface BrainFilesProps {
  status: OrganizeStatus
  onOpenFile: (path: string) => void
}

/**
 * "비서의 뇌" 줄 — 정리 상태와 원문·바뀐 파일. 칩을 누르면 문서 패널에서 열어 바로 고친다
 * (references/features/assistant.md "녹음 기록 자동 정리" > "화면")
 */
export default function BrainFiles({ status, onOpenFile }: BrainFilesProps) {
  const { t } = useLocale()
  const labels = t.assistant.organize.card
  const { stage, notePath, changedFiles, errorMessage } = status
  // 에이전트가 원문 위에 요약을 쓰면 원문도 바뀐 파일에 들어온다. 한 번만 보인다
  const paths = [...(notePath ? [notePath] : []), ...changedFiles.filter((p) => p !== notePath)]

  const stageText = () => {
    if (stage === 'done') return labels.done({ count: changedFiles.length })
    if (stage === 'error') return labels.failed({ reason: errorMessage ?? '' })

    return labels.stages[stage]
  }

  return (
    <div className={styles.block}>
      <p className={styles.status} role={stage === 'error' ? 'alert' : undefined}>
        {labels.title} · {stageText()}
      </p>
      {paths.length ? (
        <ul className={styles.files}>
          {paths.map((path) => (
            <li key={path}>
              {isOpenableFile(path) ? (
                <button
                  type="button"
                  className={styles.chip}
                  title={path}
                  aria-label={labels.editFile({ name: path })}
                  onClick={() => onOpenFile(path)}
                >
                  <Icon name="file" />
                  {path === notePath ? <span className={styles.tag}>{labels.noteTag}</span> : null}
                  <span className={styles.path}>{path}</span>
                </button>
              ) : (
                <span className={styles.outsideFile}>{path}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
