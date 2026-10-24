import type {
  GetOrganizeStatusRequest,
  ReadWorkspaceFileRequest,
  SendAssistantMessageRequest,
  SetAssistantAutoOrganizeRequest,
  SetAssistantPermissionModeRequest,
  SetAssistantProviderRequest,
  WriteWorkspaceFileRequest
} from '@shared/ipc'

/**
 * @description 녹음 기록 자동 정리 스위치를 저장합니다. 꺼도 원문은 작업 폴더에 저장됩니다.
 * @param isEnabled - 켜짐 여부
 * @returns 갱신된 작업 폴더 상태
 * @example
 * await setAssistantAutoOrganizeApi({ isEnabled: false })
 */
export const setAssistantAutoOrganizeApi = async ({ isEnabled }: SetAssistantAutoOrganizeRequest) =>
  window.api.assistant.setAutoOrganize({ isEnabled })

/**
 * @description 개인 비서 작업 폴더 상태(경로·문제·git 여부·권한 모드)를 조회합니다.
 * @returns 작업 폴더 상태
 * @example
 * const status = await getAssistantStatusApi()
 */
export const getAssistantStatusApi = async () => window.api.assistant.status()

/**
 * @description 작업 폴더 경로만 조회합니다. 전체 상태와 달리 CLI 탐색을 기다리지 않아 바로 답합니다.
 * @returns 작업 폴더 경로. 고른 적이 없으면 null
 * @example
 * const { folder } = await getAssistantFolderApi()
 */
export const getAssistantFolderApi = async () => window.api.assistant.folder()

/**
 * @description main의 폴더 고르기 대화상자를 엽니다. 폴더를 바꾸면 진행 중 대화가 비워집니다.
 * @returns 갱신된 작업 폴더 상태. 취소하면 그대로
 * @example
 * const status = await chooseAssistantFolderApi()
 */
export const chooseAssistantFolderApi = async () => window.api.assistant.chooseFolder()

/**
 * @description 에이전트 권한 모드를 저장합니다.
 * @param permissionMode - `acceptEdits` 또는 `bypassPermissions`
 * @returns 갱신된 작업 폴더 상태
 * @example
 * await setAssistantPermissionModeApi({ permissionMode: 'acceptEdits' })
 */
export const setAssistantPermissionModeApi = async ({
  permissionMode
}: SetAssistantPermissionModeRequest) => window.api.assistant.setPermissionMode({ permissionMode })

/**
 * @description 채팅이 쓸 에이전트 CLI를 저장합니다. 대화 중에는 화면이 바꾸지 못하게 막습니다.
 * @param provider - `claude-cli` 또는 `codex-cli`
 * @returns 갱신된 작업 폴더 상태
 * @example
 * await setAssistantProviderApi({ provider: 'codex-cli' })
 */
export const setAssistantProviderApi = async ({ provider }: SetAssistantProviderRequest) =>
  window.api.assistant.setProvider({ provider })

/**
 * @description 진행 중 대화를 조회합니다. 화면을 옮겼다 돌아와도 같은 대화를 이어 그립니다.
 * @returns 대화 상태
 * @example
 * const state = await getAssistantStateApi()
 */
export const getAssistantStateApi = async () => window.api.assistant.state()

/**
 * @description 에이전트에게 질문을 보냅니다. 턴이 시작되면 바로 돌아오고 답은 `onAssistantState`로 받습니다.
 * @param provider - 에이전트 CLI
 * @param text - 질문
 * @returns 없음
 * @example
 * await sendAssistantMessageApi({ provider: 'claude-cli', text: '회의 메모 템플릿을 만들어 줘' })
 */
export const sendAssistantMessageApi = async ({ provider, text }: SendAssistantMessageRequest) => {
  await window.api.assistant.send({ provider, text })
}

/**
 * @description 실행 중인 에이전트를 중지합니다. 받은 글과 세션은 남습니다.
 * @returns 없음
 * @example
 * await cancelAssistantApi()
 */
export const cancelAssistantApi = async () => {
  await window.api.assistant.cancel()
}

/**
 * @description 대화를 비우고 새 대화를 시작합니다. 실행 중이면 거절됩니다.
 * @returns 빈 대화 상태
 * @example
 * const state = await resetAssistantChatApi()
 */
export const resetAssistantChatApi = async () => window.api.assistant.reset()

/**
 * @description 작업 폴더의 마크다운 문서 목록을 조회합니다. 처음 부르면 main이 폴더 감시를 시작합니다.
 * @returns 작업 폴더 기준 상대 경로 목록 (사전순)
 * @example
 * const paths = await listWorkspaceFilesApi()
 */
export const listWorkspaceFilesApi = async () => window.api.assistant.listFiles()

/**
 * @description 작업 폴더의 문서 하나를 읽습니다.
 * @param path - 작업 폴더 기준 상대 경로 (.md)
 * @returns 경로와 본문
 * @example
 * const { content } = await readWorkspaceFileApi({ path: 'notes/a.md' })
 */
export const readWorkspaceFileApi = async ({ path }: ReadWorkspaceFileRequest) =>
  window.api.assistant.readFile({ path })

/**
 * @description 작업 폴더의 문서 하나를 저장합니다.
 * @param path - 작업 폴더 기준 상대 경로 (.md)
 * @param content - 저장할 본문
 * @returns 없음
 * @example
 * await writeWorkspaceFileApi({ path: 'notes/a.md', content })
 */
export const writeWorkspaceFileApi = async ({ path, content }: WriteWorkspaceFileRequest) => {
  await window.api.assistant.writeFile({ path, content })
}

/**
 * @description `/` 명령 메뉴에 보여 줄 스킬 목록(작업 폴더와 사용자 홈의 `.claude/skills`)을 조회합니다.
 * @returns 이름순 스킬 목록
 * @example
 * const skills = await listAssistantSkillsApi()
 */
export const listAssistantSkillsApi = async () => window.api.assistant.listSkills()

/**
 * @description 지금 작업 폴더에 기본 규칙 파일(CLAUDE.md·AGENTS.md)·폴더·스킬을 넣습니다. 이미 있는 파일은 덮지 않습니다.
 * @returns `isInstalled` — 넣었으면 true, CLAUDE.md나 AGENTS.md가 이미 있어 건너뛰었으면 false
 * @example
 * const { isInstalled } = await installHarnessApi()
 */
export const installHarnessApi = async () => window.api.assistant.installHarness()

/**
 * @description 녹음 기록이 비서의 뇌(작업 폴더)에 어디 저장됐고 정리 에이전트가 어떤 파일을 바꿨는지 조회합니다.
 * @param meetingId - 회의 ID
 * @returns 정리 상태. 뇌에 보낸 적 없으면 null. 앱을 다시 켠 뒤에는 원문 경로만 담긴다
 * @example
 * const status = await getOrganizeStatusApi({ meetingId })
 */
export const getOrganizeStatusApi = async ({ meetingId }: GetOrganizeStatusRequest) =>
  window.api.organize.status({ meetingId })
