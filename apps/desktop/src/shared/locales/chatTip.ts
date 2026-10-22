/** 빈 대화의 팁 한 줄 문구 (references/features/ui.md "채팅창 리뉴얼" > "홈"). ko가 타입을 정하고 en은 같은 키를 가져야 한다 */
export const chatTipKo = {
  label: '팁',
  /** 팁이 기대는 기본 설정 스킬이 없을 때 대신 보인다 */
  missingSkill: ({ feature, skill }: { feature: string; skill: string }) =>
    `'${feature}' 기능은 ${skill} 스킬로 동작해요. 설정 → 개인 비서 → 기본 설정 추가하기로 넣거나, "${feature} 스킬 만들어 줘"라고 해 보세요.`,
  features: {
    todo: '할 일 관리',
    profile: '내 정보 기억',
    style: '말투 맞추기',
    wiki: '위키 정리',
    project: '프로젝트 기록',
    draft: '글 초안',
    retrospective: '회고',
    recording: '녹음 정리'
  },
  tips: {
    routine: '"매일 아침 9시에 오늘 할 일 정리해 줘"처럼 말하면 루틴으로 만들어 드려요.',
    todoAdd: '"금요일까지 보고서 쓰기, 할 일에 추가해 줘"라고 하면 할 일 목록에 적어요.',
    todoToday: '"오늘 뭐 해야 해?"라고 물으면 마감이 다가온 일부터 알려 드려요.',
    profile: '"나 아침형 인간이야, 기억해 줘"처럼 나에 대해 말해 주면 프로필에 적어 둬요.',
    style: '"답은 더 짧게 해 줘", "이런 표현 쓰지 마"라고 하면 다음부터 그 말투로 답해요.',
    wikiOrganize: '글이나 링크를 붙이고 "위키로 정리해 줘"라고 하면 주제별 문서로 나눠 저장해요.',
    wikiAsk: '"전에 정리한 ○○ 뭐였지?"라고 물으면 위키에서 먼저 찾고 출처도 알려 드려요.',
    project: '"새 프로젝트 시작할게"라고 하면 프로젝트 노트를 만들고 진행 상황을 기록해요.',
    draft: '"이 주제로 글 초안 같이 써 줘"라고 하면 목적과 독자부터 묻고 초안을 잡아요.',
    retrospective: '"오늘 회고하자"라고 하면 질문을 하나씩 드리고 답을 날짜별로 남겨요.',
    slashMenu: '/를 치면 녹음, 기록 찾기, 문서 열기, 루틴 같은 모든 기능이 나와요.',
    atMenu: '@를 치면 작업 폴더의 문서나 폴더를 골라 질문에 붙일 수 있어요.',
    skillMenu: '/ 메뉴에서 스킬을 고르면 그 스킬로 바로 시작해요.',
    newChat: ({ key }: { key: string }) => `${key} 키로 언제든 새 대화를 열 수 있어요.`,
    speakInstead:
      '있었던 일은 글로 쓰지 말고 말로 남기세요. 입력창의 마이크를 누르고 말하면 끝이에요.',
    recordShortcut: ({ key }: { key: string }) =>
      `${key} 키를 누르면 다른 앱을 쓰다가도 바로 녹음이 시작돼요. 창을 닫아도 녹음은 계속돼요.`,
    knowsYou:
      '비서는 아는 만큼 도와요. 하루에 있었던 일, 떠오른 생각, 정한 일을 말해 두면 비서가 나를 알아가요.',
    noNeedToOrganize: '정리해서 말하지 않아도 돼요. 생각나는 대로 말하면 비서가 알아서 정리해요.',
    askLater: '말로 남긴 건 작업 폴더에 글로 쌓여요. 나중에 "그때 뭐라고 했지?"라고 물어보면 돼요.',
    onDevice:
      '소리를 글로 바꾸는 건 이 Mac 안에서 해요. 정리할 때만 연결한 Claude나 Codex 계정으로 보내요.',
    endOfDay: '하루를 마치며 오늘 있었던 일을 말해 두면 그대로 하루 기록이 돼요.',
    afterCall: '통화나 미팅이 끝나면 정한 것을 말로 남겨 두세요. 할 일은 할 일 목록에 들어가요.',
    learnedToday: '오늘 배운 것을 말로 남기고 "방금 녹음 위키로 정리해 줘"라고 하면 위키가 돼요.',
    phoneMemo: '휴대폰 음성 메모(m4a)도 / → 파일로 기록 만들기로 가져올 수 있어요.',
    meeting: '회의도 그대로 녹음하면 돼요. 누가 무슨 말을 했는지 나눠서 적어요.',
    findRecords: '/ → 기록 찾기로 예전에 말해 둔 걸 찾을 수 있어요.',
    widget: ({ key }: { key: string }) =>
      `${key} 키로 녹음 위젯을 띄우면 앱 창을 열지 않고도 녹음을 켜고 끌 수 있어요.`,
    dictation: ({ key }: { key: string }) =>
      `${key} 키를 누르고 말하면 다른 앱의 입력칸에 글자로 넣어 드려요.`,
    recordNote: '녹음하면서 노트에 링크나 이름을 적어 두면 같이 정리해요.',
    systemAudio: '온라인 회의는 상대방 목소리까지 함께 녹음할 수 있어요. 설정 → 마이크에서 켜요.',
    quality: '마이크가 멀거나 소리가 작으면 녹음 중에 알려 드려요.',
    speakers: '기록에서 "화자 1"을 실제 이름으로 바꾸거나 같은 사람을 하나로 합칠 수 있어요.',
    glossary: '자주 쓰는 이름이나 용어는 설정 → 용어 사전에 넣어 두면 정확하게 받아 적어요.',
    attachRecord: '@로 녹음 기록을 붙이고 "이 내용으로 메일 초안 써 줘"처럼 부탁할 수 있어요.',
    weeklyRoutine:
      '"매주 금요일에 이번 주 녹음을 모아 주간 보고 써 줘"처럼 루틴으로 맡길 수 있어요.',
    copyRecord: '기록을 복사해서 메신저나 문서에 바로 붙일 수 있어요.',
    openChangedFile:
      '비서가 고친 파일 이름을 누르면 옆에서 바로 열어 고칠 수 있어요. 저장은 ⌘S예요.',
    askDocument: '문서를 열어 둔 채로 물으면 그 문서에 대해 답해요.',
    rules: '작업 폴더의 CLAUDE.md와 스킬을 고치면 비서가 그 규칙대로 일해요.',
    routineNotify:
      '루틴이 끝나면 알림으로 알려 드려요. 켜고 끄기와 지금 실행은 설정 → 개인 비서 → 루틴에서 해요.',
    chooseAgent: '비서는 Claude Code와 Codex 중에서 고를 수 있어요. 설정 → 개인 비서에서 바꿔요.',
    makeSkill:
      '자주 하는 일은 스킬로 만들어 두면 매번 설명하지 않아도 돼요. "주간 보고를 이 양식으로 쓰는 스킬 만들어 줘"라고 해 보세요.',
    skillFolder:
      '작업 폴더의 .claude/skills에 넣은 스킬은 / 메뉴에 나타나요. 홈 폴더 ~/.claude/skills의 스킬도 함께 보여요.',
    editSkill:
      '기본 설정으로 넣은 스킬은 마음대로 고쳐도 돼요. recording 스킬을 고치면 녹음이 원하는 양식으로 정리돼요.',
    gitFolder:
      '작업 폴더를 git 저장소로 두면 규칙과 스킬을 다른 Mac에서도 쓰고 팀과도 나눌 수 있어요.',
    sharedSkill:
      '다른 사람이 만든 스킬도 넣어 쓸 수 있어요. 비서는 스킬에 적힌 대로 따르니 넣기 전에 한 번 읽어 보세요.'
  }
}

export const chatTipEn: typeof chatTipKo = {
  label: 'Tip',
  missingSkill: ({ feature, skill }) =>
    `${feature} runs on the ${skill} skill. Add it from Settings → Personal assistant → Add default setup, or say "make a ${feature} skill".`,
  features: {
    todo: 'To-dos',
    profile: 'Remembering you',
    style: 'Answer style',
    wiki: 'Wiki',
    project: 'Project notes',
    draft: 'Drafts',
    retrospective: 'Retrospectives',
    recording: 'Recording cleanup'
  },
  tips: {
    routine: 'Say "Sort out my to-dos every morning at 9" and it becomes a routine.',
    todoAdd: 'Say "Add writing the report by Friday to my to-dos" and it goes on your list.',
    todoToday: 'Ask "What should I do today?" to hear what is due soonest.',
    profile:
      'Tell it about yourself, like "I am a morning person, remember that", and it saves it.',
    style:
      'Say "Keep answers shorter" or "Don\'t use that phrase" and it answers that way from then on.',
    wikiOrganize: 'Paste text or a link and say "Put this in the wiki" to save it as topic pages.',
    wikiAsk: 'Ask "What did I note about X?" and it checks your wiki first and cites it.',
    project: 'Say "I\'m starting a new project" to get a project note that tracks progress.',
    draft: 'Say "Help me draft a post on this" and it asks about purpose and readers first.',
    retrospective:
      'Say "Let\'s do a retrospective" and it asks one question at a time and saves your answers by date.',
    slashMenu: 'Type / to reach every feature: recording, finding records, documents, routines.',
    atMenu: 'Type @ to attach a document or folder from your work folder to the question.',
    skillMenu: 'Pick a skill from the / menu to start with that skill.',
    newChat: ({ key }) => `Press ${key} to start a new chat at any time.`,
    speakInstead:
      "Don't write down what happened. Say it. Press the mic in the input box and talk.",
    recordShortcut: ({ key }) =>
      `Press ${key} to start recording even from another app. Recording keeps going when the window is closed.`,
    knowsYou:
      'The assistant helps as much as it knows. Say what happened today, what you thought of and what you decided, and it gets to know you.',
    noNeedToOrganize:
      'No need to organize your thoughts first. Just talk and the assistant sorts it out.',
    askLater:
      'What you say piles up as text in your work folder. Later, just ask "What did I say about that?"',
    onDevice:
      'Speech is turned into text on this Mac. It is sent to your connected Claude or Codex account only for cleanup.',
    endOfDay: 'At the end of the day, say what happened and it becomes your daily log.',
    afterCall: 'After a call or meeting, say what was decided. To-dos go on your to-do list.',
    learnedToday: 'Say what you learned today, then ask "Put that recording in the wiki".',
    phoneMemo: 'Voice memos from your phone (m4a) come in through / → Transcribe a file.',
    meeting: 'Meetings work too. Just record and it notes who said what.',
    findRecords: 'Use / → Find records to look up something you said before.',
    widget: ({ key }) =>
      `Press ${key} for the recording widget to start and stop without opening the app window.`,
    dictation: ({ key }) => `Press ${key} and speak to type into the text field of any app.`,
    recordNote: 'Jot links or names in the note while recording and they are used in the cleanup.',
    systemAudio:
      'For online meetings, the other side can be recorded too. Turn it on in Settings → Microphone.',
    quality: 'If the mic is far away or too quiet, you are told while recording.',
    speakers: 'In a record, rename "Speaker 1" to a real name or merge two speakers into one.',
    glossary:
      'Add names and terms you use often in Settings → Glossary so they are transcribed right.',
    attachRecord: 'Attach a record with @ and ask "Draft an email from this".',
    weeklyRoutine:
      'Hand it off as a routine: "Every Friday, write a weekly report from this week\'s recordings".',
    copyRecord: 'Copy a record and paste it straight into a chat or document.',
    openChangedFile:
      'Click a file the assistant changed to open and edit it on the side. Save with ⌘S.',
    askDocument: 'Ask with a document open and it answers about that document.',
    rules:
      'Edit CLAUDE.md and the skills in your work folder and the assistant follows those rules.',
    routineNotify:
      'You get a notification when a routine finishes. Turn routines on or off, or run one now, in Settings → Personal assistant → Routines.',
    chooseAgent:
      'The assistant can run on Claude Code or Codex. Switch in Settings → Personal assistant.',
    makeSkill:
      'Turn things you do often into a skill so you never explain them twice. Try "Make a skill that writes my weekly report in this format".',
    skillFolder:
      'Skills in .claude/skills of your work folder show up in the / menu, along with those in ~/.claude/skills.',
    editSkill:
      'Feel free to edit the default setup skills. Change the recording skill to have recordings cleaned up your way.',
    gitFolder:
      'Keep your work folder in a git repository to use your rules and skills on another Mac or share them with a team.',
    sharedSkill:
      'You can add skills made by others. The assistant follows what a skill says, so read it before adding.'
  }
}
