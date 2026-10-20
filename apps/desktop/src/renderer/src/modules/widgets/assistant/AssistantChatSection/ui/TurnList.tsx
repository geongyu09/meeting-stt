import type { AssistantTurn } from '@shared/types'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { isOpenableFile } from '../utils/isOpenableFile'
import styles from './TurnList.module.css'

interface TurnListProps {
  turns: AssistantTurn[]
  isRunning: boolean
  onOpenFile: (path: string) => void
}

/** 대화 턴 목록. 답변은 줄바꿈만 살린 평문이고, 도구는 한 줄씩, 바뀐 파일은 에디터로 여는 버튼이다 */
export default function TurnList({ turns, isRunning, onOpenFile }: TurnListProps) {
  const { t } = useLocale()
  const labels = t.assistant.chat
  const lastTurnId = turns.at(-1)?.id

  return (
    <ol className={styles.list}>
      {turns.map((turn) => (
        <li key={turn.id} className={turn.role === 'user' ? styles.user : styles.agent}>
          <span className={styles.role}>{turn.role === 'user' ? labels.you : labels.agent}</span>
          {turn.text ? <p className={styles.text}>{turn.text}</p> : null}
          {isRunning && turn.id === lastTurnId ? (
            <p className={styles.working} role="status">
              {labels.working}
            </p>
          ) : null}
          {turn.tools.length ? (
            <ul className={styles.tools}>
              {turn.tools.map((tool) => (
                <li key={tool.id}>
                  <span className={styles.toolName}>{tool.name}</span>
                  {tool.target ? ` ${tool.target}` : null}
                </li>
              ))}
            </ul>
          ) : null}
          {turn.changedFiles.length ? (
            <div className={styles.files}>
              <span className={styles.filesTitle}>{labels.changedFiles}</span>
              {turn.changedFiles.map((path) =>
                isOpenableFile(path) ? (
                  <button
                    key={path}
                    type="button"
                    className={styles.fileButton}
                    onClick={() => onOpenFile(path)}
                  >
                    {path}
                  </button>
                ) : (
                  <span key={path} className={styles.file}>
                    {path}
                  </span>
                )
              )}
            </div>
          ) : null}
          {turn.error ? (
            <p className={styles.error} role="alert">
              {turn.error}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
