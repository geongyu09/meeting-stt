import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { AssistantProvider, LlmStatus } from '@shared/types'
import { ASSISTANT_PROVIDERS } from '@shared/assistant'
import { formatAccelerator } from '@shared/shortcut'
import { controlRecordingApi } from '@renderer/shared/api/recording'
import useAssistantChat from '@renderer/shared/hooks/domain/assistant/useAssistantChat'
import useAssistantStatus from '@renderer/shared/hooks/domain/assistant/useAssistantStatus'
import useWorkspaceFiles from '@renderer/shared/hooks/domain/assistant/useWorkspaceFiles'
import useWorkspaceSkills from '@renderer/shared/hooks/domain/assistant/useWorkspaceSkills'
import useLlmStatus from '@renderer/shared/hooks/domain/llm/useLlmStatus'
import useAudioImport from '@renderer/shared/hooks/domain/meeting/useAudioImport'
import useMeetings from '@renderer/shared/hooks/domain/meeting/useMeetings'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { COMMAND_PATHS, COMMANDS, MAX_MENU_ITEMS } from './constants/commands'
import type { CommandId, MenuGroup, MenuItem } from './types/menu'
import type { RecordSearch } from './types/recordSearch'
import { folderPathsOf, matchesQuery, type MenuQuery } from './utils/menuQuery'
import ChatNotice from './ui/ChatNotice'
import Composer from './ui/Composer'
import RecordTimeline from './ui/RecordTimeline'
import TurnList from './ui/TurnList'
import styles from './index.module.css'

/** 아래에서 이만큼 안이면 새 글이 올 때 따라 내려간다. 위로 올려 읽는 중이면 그대로 둔다 */
const STICK_TO_BOTTOM_PX = 80
/** 이 시각 뒤에 만들어진 회의만 대화에 기록 카드로 보인다 (references/features/recording.md "채팅 창의 녹음" > "기록 카드") */
const SESSION_STARTED_AT = Date.now()

const cliPathOf = ({
  provider,
  llmStatus
}: {
  provider: AssistantProvider
  llmStatus: LlmStatus
}) => (provider === 'codex-cli' ? llmStatus.codexCliPath : llmStatus.claudeCliPath)

const parentFolderOf = (path: string) => path.split('/').slice(0, -1).join('/')

interface AssistantChatSectionProps {
  /** 문서 패널에 열린 파일. 패널이 닫혀 있으면 null */
  openPath: string | null
  /** 파일과 함께 패널을 연다. null이면 패널만 열어 고르게 한다 */
  onOpenDocument: (path: string | null) => void
  /** 입력 도크 바로 위에 붙는 녹음 카드. 페이지가 `recording/RecorderSection`을 넘긴다 */
  recorderSlot?: ReactNode
  /** 기록 카드의 "전체 기록 보기"·기록 찾기 결과 — 페이지가 그 회의의 전체 기록 패널을 연다 */
  onOpenRecord: (meetingId: string) => void
}

/**
 * 채팅 창 (references/features/ui.md "채팅창 리뉴얼"). 대화의 단일 출처는 main이라 화면을 옮겼다 돌아와도 이어 그린다.
 * 에이전트는 설정(`AssistantStatus.provider`)을 따르고 여기서 고르지 않는다.
 */
export default function AssistantChatSection({
  openPath,
  onOpenDocument,
  recorderSlot,
  onOpenRecord
}: AssistantChatSectionProps) {
  const { t } = useLocale()
  const labels = t.assistant.chat
  const navigate = useNavigate()
  const { status } = useAssistantStatus()
  const { status: llmStatus } = useLlmStatus()
  const { settings } = useSettings()
  const {
    isRecording,
    meetingId: recordingMeetingId,
    startedAt: recordingStartedAt,
    qualityIssue,
    errorMessage: recordingError
  } = useRecordingState()
  const { meetings } = useMeetings()
  const { error: importError, importAudio } = useAudioImport()
  // 정지한 회의는 레이아웃이 이동하며 location.state로 알려 준다 (references/features/recording.md "채팅 창의 녹음")
  const stoppedMeetingId =
    (useLocation().state as { stoppedMeetingId?: string } | null)?.stoppedMeetingId ?? null
  const { state, send, cancel, reset } = useAssistantChat()
  const folder = status && !status.folderProblem ? status.folder : null
  const { files } = useWorkspaceFiles({ folder })
  const { skills } = useWorkspaceSkills({ folder })
  const [actionError, setActionError] = useState<string | null>(null)
  // 기록 찾기: 도크가 찾기 모드면 Enter가 에이전트 대신 검색을 부르고 결과는 대화 속 카드다
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [searches, setSearches] = useState<RecordSearch[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const userTurnCount = state.turns.filter((turn) => turn.role === 'user').length
  const userTurnCountRef = useRef(userTurnCount)

  // 그리기 전에 여백을 맞춰야 보낸 말풍선이 튀지 않고 한 번에 맨 위로 간다
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const spacer = spacerRef.current
    if (!scroller || !spacer) return

    // 마지막 말풍선부터 끝까지가 화면보다 짧은 만큼 여백을 둬, 맨 아래로 내리면 그 말풍선이 맨 위에 온다
    const lastUserTurn = Array.from(scroller.querySelectorAll('[data-user-turn]')).at(-1)
    const { paddingTop, paddingBottom } = getComputedStyle(scroller)
    const visibleHeight = scroller.clientHeight - parseFloat(paddingTop) - parseFloat(paddingBottom)
    const contentHeight = lastUserTurn
      ? spacer.getBoundingClientRect().top - lastUserTurn.getBoundingClientRect().top
      : visibleHeight
    spacer.style.height = `${Math.max(0, visibleHeight - contentHeight)}px`

    const isNewQuestion = userTurnCount > userTurnCountRef.current
    userTurnCountRef.current = userTurnCount
    if (isNewQuestion || isAtBottomRef.current) scroller.scrollTop = scroller.scrollHeight
  }, [state.turns, meetings, isRecording, searches, userTurnCount])

  const handleScroll = () => {
    const scroller = scrollRef.current
    if (!scroller) return

    isAtBottomRef.current =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < STICK_TO_BOTTOM_PX
  }

  /** 실패는 입력 도크 위의 한 줄로 알린다 */
  const runSafely = async (task: Promise<unknown>) => {
    try {
      await task
      setActionError(null)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : labels.sendError)
    }
  }

  const handleCommand = (id: CommandId) => {
    if (id === 'record') return runSafely(controlRecordingApi({ kind: 'start' }))
    if (id === 'importAudio') return importAudio()
    if (id === 'findRecords') return setIsSearchMode(true)
    if (id === 'newChat') return state.turns.length ? runSafely(reset()) : undefined
    if (id === 'openDocument') return onOpenDocument(null)

    return navigate(COMMAND_PATHS[id])
  }

  const groupsOf = (query: MenuQuery | null): MenuGroup[] => {
    if (!query) return []
    const itemsOf = (candidates: MenuItem[]) =>
      candidates
        .filter(({ title, description }) =>
          matchesQuery({ query: query.query, fields: [title, description] })
        )
        .slice(0, MAX_MENU_ITEMS)

    if (query.kind === 'command') {
      const commands = itemsOf(
        COMMANDS.map(({ id, icon }) => ({
          id: `command:${id}`,
          icon,
          title: labels.commands[id].label,
          description: labels.commands[id].description,
          isMono: false,
          action: { kind: 'command', commandId: id }
        }))
      )
      const skillItems = itemsOf(
        skills.map(({ name, description }) => ({
          id: `skill:${name}`,
          icon: 'bolt',
          title: `/${name}`,
          description,
          isMono: true,
          action: { kind: 'insert', text: `/${name}` }
        }))
      )

      return [
        { id: 'commands', title: labels.menu.commands, items: commands },
        { id: 'skills', title: labels.menu.skills, items: skillItems }
      ].filter((group) => group.items.length)
    }

    const fileItems = itemsOf(
      files.map((path) => ({
        id: `file:${path}`,
        icon: 'file',
        title: path,
        description: parentFolderOf(path)
          ? labels.menu.folderOf({ name: parentFolderOf(path).split('/').at(-1) ?? '' })
          : labels.menu.rootFolder,
        isMono: true,
        action: { kind: 'insert', text: `@${path}` }
      }))
    )
    const folderItems = itemsOf(
      folderPathsOf(files).map((path) => ({
        id: `folder:${path}`,
        icon: 'folder',
        title: path,
        description: labels.menu.wholeFolder,
        isMono: true,
        action: { kind: 'insert', text: `@${path}` }
      }))
    )
    const items = [...fileItems, ...folderItems]

    return items.length ? [{ id: 'files', title: labels.menu.files, items }] : []
  }

  // 대화 중이면 그 대화의 에이전트, 아니면 설정의 에이전트(저장값이 없으면 main이 설치된 첫 CLI로 채운다)
  const provider = state.provider ?? status?.provider ?? ASSISTANT_PROVIDERS[0]
  const folderNotice = !status
    ? null
    : !status.folder
      ? labels.noFolder
      : status.folderProblem
        ? t.assistant.folderProblems[status.folderProblem]
        : null
  const isCliMissing = llmStatus !== null && !cliPathOf({ provider, llmStatus })
  const isReady = status !== null && folderNotice === null && llmStatus !== null && !isCliMissing
  const placeholder = isSearchMode
    ? t.transcript.search.placeholder
    : openPath
      ? labels.placeholderDocument
      : state.turns.length
        ? labels.placeholderContinue
        : labels.placeholder
  const sessionMeetings = meetings
    .filter((meeting) => meeting.createdAt >= SESSION_STARTED_AT)
    .toSorted((a, b) => a.createdAt - b.createdAt)
  const recordingLabels = t.recording.recorder
  const recordingHint = settings?.recordingShortcut
    ? `${recordingLabels.keepsRunning} · ${formatAccelerator(settings.recordingShortcut)}`
    : recordingLabels.keepsRunning
  const qualityNotice = qualityIssue
    ? `${t.recording.quality[qualityIssue].title} ${t.recording.quality[qualityIssue].advice}`
    : null

  // 열린 문서에 대해 묻는 것이라 에이전트에게 어느 문서인지 알린다. 말풍선에도 그대로 보인다
  const handleSend = async (text: string) => {
    if (isSearchMode) {
      setSearches((previous) => [...previous, { at: Date.now(), query: text.trim() }])
      setIsSearchMode(false)
      return
    }
    await send({
      provider,
      text: openPath && !text.includes(`@${openPath}`) ? `@${openPath} ${text}` : text
    })
  }

  return (
    <section className={styles.section} aria-label={labels.title}>
      <div className={styles.scroll} ref={scrollRef} onScroll={handleScroll}>
        <div className={styles.thread}>
          {state.turns.length ? (
            <TurnList
              turns={state.turns}
              isRunning={state.isRunning}
              openPath={openPath}
              onOpenFile={onOpenDocument}
            />
          ) : null}
          <RecordTimeline
            meetings={sessionMeetings}
            searches={searches}
            recordingMeetingId={recordingMeetingId}
            recordingStartedAt={recordingStartedAt ?? 0}
            stoppedMeetingId={stoppedMeetingId}
            onOpenRecord={onOpenRecord}
          />
        </div>
        <div ref={spacerRef} aria-hidden="true" />
      </div>
      <div className={styles.footer}>
        <ChatNotice
          folderNotice={folderNotice}
          missingCliLabel={isCliMissing ? t.assistant.providers[provider] : null}
          isNotGitRepo={status !== null && !status.isGitRepo}
        />
        {(actionError ?? importError) ? (
          <p className={styles.error} role="alert">
            {actionError ?? importError}
          </p>
        ) : null}
        {recorderSlot}
        <Composer
          placeholder={placeholder}
          prefixChip={isSearchMode ? t.transcript.search.chip : null}
          isRunning={state.isRunning}
          isRecording={isRecording}
          // 기록 찾기는 에이전트가 없어도 된다
          isDisabled={!isReady && !isSearchMode}
          groupsOf={groupsOf}
          onSend={handleSend}
          onStop={() => void cancel()}
          onRecord={() => void runSafely(controlRecordingApi({ kind: 'toggle' }))}
          onCommand={(id) => void handleCommand(id)}
          onClearPrefix={() => setIsSearchMode(false)}
        />
        {/* 녹음 안내 한 줄. 세션 오류(마이크 권한·모델 없음)는 녹음이 아니어도 보인다 */}
        {recordingError ? (
          <p className={styles.recordingError} role="alert">
            {recordingError}
          </p>
        ) : isRecording ? (
          <p className={qualityNotice ? styles.qualityNotice : styles.recordingHint} role="status">
            {qualityNotice ?? recordingHint}
          </p>
        ) : null}
      </div>
    </section>
  )
}
