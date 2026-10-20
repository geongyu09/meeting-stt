import { useEffect, useRef, useState } from 'react'
import type { AssistantProvider, LlmStatus } from '@shared/types'
import { ASSISTANT_PROVIDERS, isAssistantProvider } from '@shared/assistant'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useAssistantChat from '@renderer/shared/hooks/domain/assistant/useAssistantChat'
import useAssistantStatus from '@renderer/shared/hooks/domain/assistant/useAssistantStatus'
import useLlmStatus from '@renderer/shared/hooks/domain/llm/useLlmStatus'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import ChatNotice from './ui/ChatNotice'
import MessageInput from './ui/MessageInput'
import TurnList from './ui/TurnList'
import styles from './index.module.css'

/** 아래에서 이만큼 안이면 새 글이 올 때 따라 내려간다. 위로 올려 읽는 중이면 그대로 둔다 */
const STICK_TO_BOTTOM_PX = 80

const cliPathOf = ({
  provider,
  llmStatus
}: {
  provider: AssistantProvider
  llmStatus: LlmStatus
}) => (provider === 'codex-cli' ? llmStatus.codexCliPath : llmStatus.claudeCliPath)

interface AssistantChatSectionProps {
  /** 바뀐 파일을 누르면 페이지가 에디터에 연다 */
  onOpenFile: (path: string) => void
}

/**
 * 개인 비서 채팅 (references/architecture.md "개인 비서 모드" > "화면").
 * 대화의 단일 출처는 main이라 화면을 옮겼다 돌아와도 이어 그린다.
 */
export default function AssistantChatSection({ onOpenFile }: AssistantChatSectionProps) {
  const { t } = useLocale()
  const labels = t.assistant.chat
  const { status } = useAssistantStatus()
  const { status: llmStatus } = useLlmStatus()
  const { state, send, cancel, reset } = useAssistantChat()
  const [selectedProvider, setSelectedProvider] = useState<AssistantProvider | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  useEffect(() => {
    const scroller = scrollRef.current
    if (scroller && isAtBottomRef.current) scroller.scrollTop = scroller.scrollHeight
  }, [state.turns])

  const handleScroll = () => {
    const scroller = scrollRef.current
    if (!scroller) return

    isAtBottomRef.current =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < STICK_TO_BOTTOM_PX
  }

  const handleReset = async () => {
    try {
      await reset()
      setActionError(null)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : labels.sendError)
    }
  }

  const installedProvider = llmStatus
    ? ASSISTANT_PROVIDERS.find((option) => cliPathOf({ provider: option, llmStatus }))
    : undefined
  // 대화 중이면 그 대화의 에이전트, 아니면 사용자가 고른 것, 아직 고르지 않았으면 설치된 첫 CLI
  const provider = state.provider ?? selectedProvider ?? installedProvider ?? ASSISTANT_PROVIDERS[0]
  const folderNotice = !status
    ? null
    : !status.folder
      ? labels.noFolder
      : status.folderProblem
        ? t.assistant.folderProblems[status.folderProblem]
        : null
  const isCliMissing = llmStatus !== null && !cliPathOf({ provider, llmStatus })
  const isReady = status !== null && folderNotice === null && llmStatus !== null && !isCliMissing

  return (
    <section className={styles.section} aria-label={labels.title}>
      <div className={styles.toolbar}>
        <label className={styles.providerField}>
          <span>{labels.provider}</span>
          <select
            value={provider}
            disabled={state.turns.length > 0 || state.isRunning}
            onChange={(event) => {
              if (isAssistantProvider(event.target.value)) setSelectedProvider(event.target.value)
            }}
          >
            {ASSISTANT_PROVIDERS.map((option) => (
              <option key={option} value={option}>
                {t.assistant.providers[option]}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          size="sm"
          disabled={state.isRunning || state.turns.length === 0}
          onClick={handleReset}
        >
          {labels.newChat}
        </Button>
      </div>
      <div className={styles.scroll} ref={scrollRef} onScroll={handleScroll}>
        {state.turns.length ? (
          <TurnList turns={state.turns} isRunning={state.isRunning} onOpenFile={onOpenFile} />
        ) : (
          <p className={styles.empty}>{labels.empty}</p>
        )}
      </div>
      <div className={styles.footer}>
        <ChatNotice
          folderNotice={folderNotice}
          missingCliLabel={isCliMissing ? t.assistant.providers[provider] : null}
          isNotGitRepo={status !== null && !status.isGitRepo}
        />
        {actionError ? (
          <p className={styles.error} role="alert">
            {actionError}
          </p>
        ) : null}
        <MessageInput
          isRunning={state.isRunning}
          isDisabled={!isReady}
          onSend={(text) => send({ provider, text })}
          onStop={() => void cancel()}
        />
      </div>
    </section>
  )
}
