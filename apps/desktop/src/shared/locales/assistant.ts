/** 개인 비서 모드(채팅·문서 에디터·설정) 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const assistantKo = {
  nav: '비서',
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
    inputLabel: '질문',
    placeholder: '무엇을 도와드릴까요?',
    placeholderContinue: '이어서 묻기, / 로 명령',
    placeholderDocument: '이 문서에 대해 묻기',
    send: '보내기',
    stop: '중지',
    record: '녹음 시작',
    working: '작업하는 중',
    copyAnswer: '답변 복사',
    copied: '복사했습니다',
    openFile: ({ name }: { name: string }) => `${name} 열기`,
    openedFile: ({ name }: { name: string }) => `${name} 열림`,
    tools: {
      read: '읽음',
      edit: '고침',
      run: '실행',
      web: '열어봄'
    },
    commands: {
      record: { label: '녹음 시작', description: '회의나 떠오른 생각을 바로 기록해요' },
      importAudio: {
        label: '파일로 기록 만들기',
        description: '다른 앱에서 녹음한 파일을 글로 옮겨요'
      },
      findRecords: { label: '기록 찾기', description: '지난 기록을 제목과 내용으로 찾아요' },
      openDocument: { label: '문서 열기', description: '작업 폴더의 문서를 열고 고쳐요' },
      routine: {
        label: '루틴 만들기',
        description: '정해진 주기에 비서가 할 일을 이야기하며 정해요'
      },
      newChat: { label: '새 대화', description: '지금 대화를 끝내고 새로 시작해요' },
      settings: { label: '설정', description: '작업 폴더, 모델, 단축키, 용어 사전' }
    },
    menu: {
      commands: '명령',
      skills: '스킬 · 작업 폴더와 내 스킬',
      files: '파일 · 작업 폴더',
      folderOf: ({ name }: { name: string }) => `${name} 폴더`,
      rootFolder: '작업 폴더',
      wholeFolder: '폴더 전체를 붙여요'
    },
    noFolder: '설정에서 작업 폴더를 먼저 고르세요.',
    cliMissing: ({ label }: { label: string }) =>
      `${label} CLI를 찾지 못했습니다. 설치하고 터미널에서 로그인한 뒤 다시 여세요.`,
    notGitRepo: '작업 폴더가 git 저장소가 아니라 에이전트가 고친 내용을 되돌리기 어렵습니다.',
    openSettings: '설정 열기',
    sendError: '질문을 보내지 못했습니다',
    routineStarter: '루틴을 만들고 싶어. 무엇을 언제 자동으로 할지 물어보면서 같이 정해 줘.',
    loading: '불러오는 중'
  },
  editor: {
    title: '문서',
    fileList: '문서 목록',
    close: '문서 닫기',
    saveKey: '⌘S',
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
    harness: {
      title: '기본 설정',
      description:
        '문서를 어디에 둘지, 할 일·회고·위키 같은 요청을 어떻게 처리할지 정한 기본 규칙 파일(CLAUDE.md·AGENTS.md)과 폴더, 스킬을 작업 폴더에 넣습니다. 이미 있는 파일은 덮지 않습니다.',
      install: '기본 설정 추가하기',
      installed: '기본 설정을 추가했습니다.',
      skipped: '작업 폴더에 CLAUDE.md나 AGENTS.md가 이미 있어 추가하지 않았습니다.',
      error:
        '기본 설정을 추가하지 못했습니다. 만들어진 CLAUDE.md·AGENTS.md를 지우고 다시 시도하세요.'
    },
    permission: {
      title: '모든 권한 허용',
      description:
        '꺼져 있으면 Claude Code는 작업 폴더 안의 파일 편집과 읽기 전용 git 명령만, Codex는 작업 폴더에만 쓸 수 있는 샌드박스 안에서 묻지 않고 실행합니다. Claude Code에 더 허용하려면 작업 폴더의 .claude/settings.json에 적으세요.',
      warning:
        '켜져 있습니다. 작업 폴더 밖의 파일과 모든 명령을 묻지 않고 실행합니다. 믿을 수 있는 폴더에서만 켜세요.',
      error: '권한 설정을 바꾸지 못했습니다'
    },
    provider: {
      title: '에이전트',
      description: '대화 중에는 바꿀 수 없어요',
      error: '에이전트를 바꾸지 못했습니다'
    },
    autoOrganize: {
      title: '녹음 기록 자동 정리',
      description:
        '녹음이 끝나면 전사 원문을 작업 폴더의 raw/recordings/에 저장하고 에이전트가 정리합니다. 켜져 있으면 녹음 내용이 Anthropic·OpenAI 서버로 전송되고, 제목도 내용으로 만듭니다. 꺼도 원문은 저장합니다.',
      error: '자동 정리 설정을 바꾸지 못했습니다'
    }
  },
  organize: {
    notification: {
      doneTitle: '기록 정리 완료',
      failedTitle: '기록 정리 실패',
      done: ({ title, count }: { title: string; count: number }) =>
        `${title} · 파일 ${count}개 변경`,
      failed: ({ title, reason }: { title: string; reason: string }) =>
        `${title} · ${reason} (원문은 저장했습니다)`
    },
    errors: {
      timeout: '10분 안에 끝나지 않아 중지했습니다'
    }
  },
  errors: {
    invalidAutoOrganize: '자동 정리 값이 올바르지 않습니다',
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
    inputLabel: 'Question',
    placeholder: 'How can I help?',
    placeholderContinue: 'Ask more, or / for commands',
    placeholderDocument: 'Ask about this document',
    send: 'Send',
    stop: 'Stop',
    record: 'Start recording',
    working: 'Working',
    copyAnswer: 'Copy answer',
    copied: 'Copied',
    openFile: ({ name }) => `Open ${name}`,
    openedFile: ({ name }) => `${name} is open`,
    tools: {
      read: 'Read',
      edit: 'Edited',
      run: 'Ran',
      web: 'Fetched'
    },
    commands: {
      record: { label: 'Start recording', description: 'Capture a meeting or a passing thought' },
      importAudio: {
        label: 'Transcribe a file',
        description: 'Turn a recording made in another app into text'
      },
      findRecords: {
        label: 'Find records',
        description: 'Search past records by title and content'
      },
      openDocument: {
        label: 'Open a document',
        description: 'Open and edit a work folder document'
      },
      routine: {
        label: 'Create a routine',
        description: 'Talk through a task for the assistant to do on a schedule'
      },
      newChat: { label: 'New chat', description: 'End this chat and start over' },
      settings: { label: 'Settings', description: 'Work folder, models, shortcuts, glossary' }
    },
    menu: {
      commands: 'Commands',
      skills: 'Skills · work folder and yours',
      files: 'Files · work folder',
      folderOf: ({ name }) => `${name} folder`,
      rootFolder: 'Work folder',
      wholeFolder: 'Attach the whole folder'
    },
    noFolder: 'Choose a work folder in Settings first.',
    cliMissing: ({ label }) =>
      `Could not find the ${label} CLI. Install it, log in from a terminal, and reopen this screen.`,
    notGitRepo:
      'The work folder is not a git repository, so changes made by the agent are hard to undo.',
    openSettings: 'Open Settings',
    sendError: 'Could not send the question',
    routineStarter:
      "I'd like to set up a routine. Ask me what to do automatically and when, and let's decide together.",
    loading: 'Loading'
  },
  editor: {
    title: 'Documents',
    fileList: 'Document list',
    close: 'Close document',
    saveKey: '⌘S',
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
    harness: {
      title: 'Default setup',
      description:
        'Adds default rule files (CLAUDE.md and AGENTS.md), folders, and skills to the work folder that set where documents go and how requests like to-dos, retrospectives, and wiki notes are handled. Existing files are never overwritten.',
      install: 'Add default setup',
      installed: 'Added the default setup.',
      skipped: 'The work folder already has CLAUDE.md or AGENTS.md, so nothing was added.',
      error:
        'Could not add the default setup. Delete any CLAUDE.md or AGENTS.md it created and try again.'
    },
    permission: {
      title: 'Allow all permissions',
      description:
        'When off, Claude Code runs only file edits inside the work folder and read-only git commands without asking, and Codex runs in a sandbox that can write only to the work folder. To allow more for Claude Code, add them to .claude/settings.json in the work folder.',
      warning:
        'On. Files outside the work folder and any command run without asking. Only turn this on for folders you trust.',
      error: 'Could not change the permission setting'
    },
    provider: {
      title: 'Agent',
      description: 'Cannot be changed during a chat',
      error: 'Could not change the agent'
    },
    autoOrganize: {
      title: 'Auto-organize recordings',
      description:
        'When a recording finishes, the transcript is saved to raw/recordings/ in the work folder and the agent organizes it. While on, recording contents are sent to Anthropic or OpenAI servers, and the title is also generated from its contents. The transcript is saved even when off.',
      error: 'Could not change the auto-organize setting'
    }
  },
  organize: {
    notification: {
      doneTitle: 'Recording organized',
      failedTitle: 'Organizing failed',
      done: ({ title, count }) => `${title} · ${count} file(s) changed`,
      failed: ({ title, reason }) => `${title} · ${reason} (transcript was saved)`
    },
    errors: {
      timeout: 'Stopped because it did not finish within 10 minutes'
    }
  },
  errors: {
    invalidAutoOrganize: 'Invalid auto-organize value',
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
