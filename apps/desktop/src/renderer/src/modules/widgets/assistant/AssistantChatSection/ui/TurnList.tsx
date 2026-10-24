import { splitRoutineProposal } from '@shared/routine'
import type { AssistantTurn } from '@shared/types'
import Icon, { type IconName } from '@renderer/shared/components/primitives/ui/Icon'
import Markdown from '@renderer/shared/components/primitives/ui/Markdown'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { isOpenableFile } from '@renderer/shared/utils/isOpenableFile'

import { toolLabelOf, type ToolLabel } from '../utils/toolLabel'
import CopyAnswerButton from './CopyAnswerButton'
import RoutineProposalCard from './RoutineProposalCard'
import styles from './TurnList.module.css'

const TOOL_ICONS: Record<ToolLabel, IconName> = {
  read: 'read',
  edit: 'pencil',
  run: 'read',
  web: 'search'
}

interface TurnListProps {
  turns: AssistantTurn[]
  isRunning: boolean
  /** 문서 패널에 열린 파일. 그 칩은 "열림"으로 보인다 */
  openPath: string | null
  onOpenFile: (path: string) => void
}

/**
 * 대화 턴 목록 (references/features/ui.md "채팅창 리뉴얼" > "대화").
 * 사용자 말풍선, 에이전트는 도구 줄 → 마크다운 답변 → 루틴 제안 카드 → 바뀐 파일 칩 → 오류 순서다.
 */
export default function TurnList({ turns, isRunning, openPath, onOpenFile }: TurnListProps) {
  const { t } = useLocale()
  const labels = t.assistant.chat
  const lastTurnId = turns.at(-1)?.id

  return (
    <ol className={styles.list}>
      {turns.map((turn) => {
        if (turn.role === 'user') {
          return (
            <li key={turn.id} className={styles.user} data-user-turn>
              {turn.text}
            </li>
          )
        }

        const { text, proposal } = splitRoutineProposal({
          text: turn.text,
          errors: t.routine.errors
        })
        return (
          <li key={turn.id} className={styles.agent}>
            {turn.tools.length ? (
              <ul className={styles.tools}>
                {turn.tools.map((tool) => {
                  const label = toolLabelOf(tool.name)
                  return (
                    <li key={tool.id}>
                      {label ? <Icon name={TOOL_ICONS[label]} /> : null}
                      {label ? labels.tools[label] : tool.name}
                      {tool.target ? <span className={styles.target}>{tool.target}</span> : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}
            {text ? <Markdown text={text} /> : null}
            {proposal ? <RoutineProposalCard proposal={proposal} /> : null}
            {turn.changedFiles.length ? (
              <div className={styles.files}>
                {turn.changedFiles.map((path) =>
                  isOpenableFile(path) ? (
                    <button
                      key={path}
                      type="button"
                      className={styles.chip}
                      aria-pressed={path === openPath}
                      onClick={() => onOpenFile(path)}
                    >
                      <Icon name="file" />
                      {path === openPath
                        ? labels.openedFile({ name: path })
                        : labels.openFile({ name: path })}
                    </button>
                  ) : (
                    <span key={path} className={styles.outsideFile}>
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
            {text && !(isRunning && turn.id === lastTurnId) ? (
              <CopyAnswerButton text={text} />
            ) : null}
            {isRunning && turn.id === lastTurnId ? (
              <p className={styles.working} role="status">
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.shimmer}>{labels.working}</span>
              </p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
