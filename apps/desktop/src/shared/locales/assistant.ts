/** 개인 비서 모드(채팅·문서 에디터·설정) 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const assistantKo = {
  nav: '비서',
  topBar: '개인 비서',
  providers: {
    'claude-cli': 'Claude Code',
    'codex-cli': 'Codex'
  },
  folderProblems: {
    missing: '작업 폴더가 없습니다. 옮겨졌거나 지워졌는지 확인하세요',
    notDirectory: '작업 폴더 경로가 폴더가 아닙니다',
    unreadable: '작업 폴더를 읽거나 쓸 권한이 없습니다'
  },
  chat: {
    title: '채팅',
    provider: '에이전트',
    newChat: '새 대화',
    empty: '작업 폴더의 문서에 대해 묻거나, 문서를 만들거나 고쳐 달라고 해 보세요.',
    inputLabel: '질문',
    placeholder: '질문을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)',
    send: '보내기',
    stop: '중지',
    you: '나',
    agent: '에이전트',
    working: '작업하는 중',
    changedFiles: '바뀐 파일',
    noFolder: '설정에서 작업 폴더를 먼저 고르세요.',
    cliMissing: ({ label }: { label: string }) =>
      `${label} CLI를 찾지 못했습니다. 설치하고 터미널에서 로그인한 뒤 다시 여세요.`,
    notGitRepo: '작업 폴더가 git 저장소가 아니라 에이전트가 고친 내용을 되돌리기 어렵습니다.',
    openSettings: '설정 열기',
    sendError: '질문을 보내지 못했습니다',
    loading: '불러오는 중'
  },
  editor: {
    title: '문서',
    fileList: '열 문서',
    pickFile: '문서를 고르세요',
    noFiles: '작업 폴더에 마크다운 문서가 없습니다',
    editorLabel: ({ path }: { path: string }) => `${path} 편집`,
    save: '저장',
    saved: '저장했습니다',
    unsaved: '저장하지 않은 변경이 있습니다',
    externalChange: '다른 곳에서 이 파일이 바뀌었습니다.',
    reload: '다시 읽기',
    listError: '문서 목록을 불러오지 못했습니다',
    loadError: '문서를 열지 못했습니다',
    saveError: '문서를 저장하지 못했습니다'
  },
  settings: {
    title: '개인 비서',
    loading: '불러오는 중',
    folder: {
      title: '작업 폴더',
      description:
        '에이전트가 이 폴더의 CLAUDE.md·AGENTS.md·스킬·훅을 읽고 문서를 만들거나 고칩니다. 질문과 에이전트가 읽은 파일 내용은 고른 에이전트의 회사(Anthropic·OpenAI) 서버로 전송됩니다.',
      none: '아직 고르지 않았습니다',
      choose: '폴더 고르기',
      notGitRepo: 'git 저장소가 아니라 에이전트가 고친 내용을 되돌리기 어렵습니다',
      chooseError: '작업 폴더를 바꾸지 못했습니다'
    },
    permission: {
      title: '모든 권한 허용',
      description:
        '꺼져 있으면 Claude Code는 작업 폴더 안의 파일 편집과 읽기 전용 git 명령만, Codex는 작업 폴더에만 쓸 수 있는 샌드박스 안에서 묻지 않고 실행합니다. Claude Code에 더 허용하려면 작업 폴더의 .claude/settings.json에 적으세요.',
      warning:
        '켜져 있습니다. 작업 폴더 밖의 파일과 모든 명령을 묻지 않고 실행합니다. 믿을 수 있는 폴더에서만 켜세요.',
      error: '권한 설정을 바꾸지 못했습니다'
    }
  },
  errors: {
    invalidProvider: '알 수 없는 에이전트입니다',
    emptyQuestion: '질문이 비어 있습니다',
    questionTooLong: '질문이 너무 깁니다',
    invalidPermissionMode: '알 수 없는 권한 모드입니다',
    invalidPath: '문서 경로가 올바르지 않습니다',
    invalidContent: '문서 내용이 올바르지 않습니다',
    documentTooLarge: '문서가 너무 커서 열거나 저장할 수 없습니다 (최대 2MB)',
    outsideFolder: '작업 폴더 밖의 파일은 열 수 없습니다',
    notMarkdown: '마크다운(.md) 문서만 열 수 있습니다',
    noFolder: '작업 폴더가 정해지지 않았습니다',
    busy: '에이전트가 아직 작업하는 중입니다',
    providerMismatch: '대화 중에는 에이전트를 바꿀 수 없습니다. 새 대화를 시작하세요',
    cliMissing: ({ label }: { label: string }) =>
      `${label} CLI를 찾지 못했습니다. 설치하고 로그인하세요`,
    cancelled: '중지했습니다',
    agentFailed: ({ reason }: { reason: string }) => `에이전트가 실패했습니다: ${reason}`,
    unknownReason: '알 수 없는 오류'
  }
}

export const assistantEn: typeof assistantKo = {
  nav: 'Assistant',
  topBar: 'Personal assistant',
  providers: {
    'claude-cli': 'Claude Code',
    'codex-cli': 'Codex'
  },
  folderProblems: {
    missing: 'The work folder is gone. Check whether it was moved or deleted',
    notDirectory: 'The work folder path is not a folder',
    unreadable: 'No permission to read or write the work folder'
  },
  chat: {
    title: 'Chat',
    provider: 'Agent',
    newChat: 'New chat',
    empty: 'Ask about the documents in your work folder, or ask the agent to create or edit one.',
    inputLabel: 'Question',
    placeholder: 'Type a question (Enter to send, Shift+Enter for a new line)',
    send: 'Send',
    stop: 'Stop',
    you: 'You',
    agent: 'Agent',
    working: 'Working',
    changedFiles: 'Changed files',
    noFolder: 'Choose a work folder in Settings first.',
    cliMissing: ({ label }) =>
      `Could not find the ${label} CLI. Install it, log in from a terminal, and reopen this screen.`,
    notGitRepo:
      'The work folder is not a git repository, so changes made by the agent are hard to undo.',
    openSettings: 'Open Settings',
    sendError: 'Could not send the question',
    loading: 'Loading'
  },
  editor: {
    title: 'Documents',
    fileList: 'Document to open',
    pickFile: 'Pick a document',
    noFiles: 'No Markdown documents in the work folder',
    editorLabel: ({ path }) => `Edit ${path}`,
    save: 'Save',
    saved: 'Saved',
    unsaved: 'You have unsaved changes',
    externalChange: 'This file was changed elsewhere.',
    reload: 'Reload',
    listError: 'Could not load the document list',
    loadError: 'Could not open the document',
    saveError: 'Could not save the document'
  },
  settings: {
    title: 'Personal assistant',
    loading: 'Loading',
    folder: {
      title: 'Work folder',
      description:
        "The agent reads this folder's CLAUDE.md, AGENTS.md, skills, and hooks, and creates or edits documents. Your questions and the files the agent reads are sent to the servers of the agent's company (Anthropic or OpenAI).",
      none: 'Not chosen yet',
      choose: 'Choose folder',
      notGitRepo: 'Not a git repository, so changes made by the agent are hard to undo',
      chooseError: 'Could not change the work folder'
    },
    permission: {
      title: 'Allow all permissions',
      description:
        'When off, Claude Code runs only file edits inside the work folder and read-only git commands without asking, and Codex runs in a sandbox that can write only to the work folder. To allow more for Claude Code, add them to .claude/settings.json in the work folder.',
      warning:
        'On. Files outside the work folder and any command run without asking. Only turn this on for folders you trust.',
      error: 'Could not change the permission setting'
    }
  },
  errors: {
    invalidProvider: 'Unknown agent',
    emptyQuestion: 'The question is empty',
    questionTooLong: 'The question is too long',
    invalidPermissionMode: 'Unknown permission mode',
    invalidPath: 'Invalid document path',
    invalidContent: 'Invalid document content',
    documentTooLarge: 'The document is too large to open or save (max 2 MB)',
    outsideFolder: 'Files outside the work folder cannot be opened',
    notMarkdown: 'Only Markdown (.md) documents can be opened',
    noFolder: 'No work folder is set',
    busy: 'The agent is still working',
    providerMismatch: 'You cannot switch agents during a chat. Start a new chat',
    cliMissing: ({ label }) => `Could not find the ${label} CLI. Install it and log in`,
    cancelled: 'Stopped',
    agentFailed: ({ reason }) => `The agent failed: ${reason}`,
    unknownReason: 'Unknown error'
  }
}
