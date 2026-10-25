/** 설정 화면 문구 (SettingsSection·pages/Settings). ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const settingsKo = {
  title: '설정',
  toc: '설정 카테고리',
  close: '설정 닫기',
  loading: '설정을 불러오는 중입니다',
  loadError: '설정을 불러오지 못했습니다',
  saveError: '설정을 저장하지 못했습니다',
  groups: {
    microphone: '마이크',
    recording: '녹음·처리',
    widget: '녹음 위젯',
    shortcut: '단축키',
    dictation: '받아쓰기',
    sttModel: '음성 인식 모델',
    update: '업데이트',
    appearance: '화면',
    speech: '답변 읽기',
    language: '언어',
    feedback: '피드백'
  },
  speechVoice: {
    title: '목소리',
    description:
      '비서 답변 아래 읽어주기 버튼이 쓸 목소리입니다. macOS에 설치된 목소리 중에서 고릅니다.',
    systemDefault: '기본 목소리 (한국어)'
  },
  inputDevice: {
    title: '입력 장치',
    description:
      '녹음에 쓸 마이크입니다. 고른 마이크가 연결돼 있지 않으면 시스템 기본 마이크로 녹음합니다.',
    missingWarning:
      '고른 마이크가 연결돼 있지 않습니다. 지금 녹음하면 시스템 기본 마이크를 씁니다.',
    systemDefault: '시스템 기본 마이크',
    previouslyChosen: '이전에 고른 마이크',
    disconnectedSuffix: '(연결되지 않음)'
  },
  microphoneTest: {
    title: '마이크 테스트',
    description: '녹음하지 않고 소리가 들어오는지 확인합니다. 위에서 고른 마이크로 듣습니다.',
    blockedWhileRecording: '녹음 중에는 테스트할 수 없습니다. 녹음을 정지한 뒤 확인해 주세요.',
    start: '테스트 시작',
    stop: '테스트 정지',
    status: {
      idle: '',
      listening: '소리가 잘 들어옵니다.',
      silent:
        '소리가 거의 잡히지 않습니다. 마이크가 음소거되었거나 다른 장치가 선택됐을 수 있습니다.'
    }
  },
  audioKeep: {
    title: '원본 녹음 파일 보관',
    description:
      '꺼 두면 회의록을 만든 뒤 원본 녹음을 지웁니다. 16kHz 녹음은 한 시간에 약 115MB를 차지하며, 보관하지 않은 회의는 나중에 다시 처리할 수 없습니다.'
  },
  audioFiles: {
    title: '녹음 파일 관리하기',
    description: '보관 중인 녹음 파일을 모아 보고 지웁니다. 녹음 파일만 지우고 회의록은 남습니다.',
    manage: '관리'
  },
  quietProcessing: {
    title: '조용히 처리',
    description:
      '회의록을 만들 때 CPU를 절반만 써서 발열과 팬 소음을 줄입니다. 대신 처리 시간이 길어지고, 이미 처리 중인 회의에는 적용되지 않습니다.'
  },
  widgetPanel: {
    title: '녹음 위젯 패널',
    description:
      '화면 오른쪽에 떠 있는 작은 패널에서 회의 중에도 녹음을 시작하고 정지합니다. 꺼도 메뉴바 아이콘과 아래 단축키로 녹음하고 패널을 다시 부를 수 있습니다.'
  },
  widgetFade: {
    title: '위젯 반투명',
    description:
      '다른 창을 쓰는 동안 위젯을 반투명하게 보여 회의 화면을 덜 가립니다. 패널을 클릭하면 다시 선명해집니다.'
  },
  opacity: {
    label: '포커스가 없을 때 불투명도'
  },
  recordingShortcut: {
    title: '회의 녹음 시작·정지',
    description:
      '다른 앱을 쓰는 중에도 이 키로 회의 녹음을 시작하고 정지합니다. 회의 녹음은 말한 사람을 나눕니다.'
  },
  memoShortcut: {
    title: '메모 녹음 시작·정지',
    description:
      '혼자 말로 남기는 기록입니다. 말한 사람을 나누지 않아 더 빨리 끝납니다. 녹음 중이면 어느 키로든 정지합니다.'
  },
  widgetShortcut: {
    title: '위젯 표시·숨김',
    description:
      '⌘·⌥·⌃ 중 하나 이상과 문자·숫자·기호 키를 함께 누르거나, 기능키(F1~F24)를 누르세요. Esc를 누르면 취소합니다.'
  },
  dictationShortcut: {
    title: '받아쓰기 시작·정지',
    description:
      '다른 앱에서 이 키를 누르고 말하면 커서 자리에 글이 들어갑니다. 다시 누르면 끝납니다.'
  },
  newChatShortcut: {
    title: '새 대화',
    description:
      '채팅 창에서 이 키를 누르면 지금 대화를 끝내고 새로 시작합니다. 다른 앱에서는 동작하지 않습니다.'
  },
  shortcutField: {
    changeLabel: ({ title }: { title: string }) => `${title} 변경`,
    pressKeys: '키를 누르세요…',
    resetTo: ({ accelerator }: { accelerator: string }) => `기본값 ${accelerator}로`,
    off: '꺼짐',
    turnOff: '끄기',
    suspendError: '단축키 입력 상태를 바꾸지 못했습니다'
  },
  updateCheck: {
    title: '시작할 때 업데이트 확인',
    description: '기본은 꺼짐이며, 켜도 다음 실행부터 확인합니다. 회의 내용은 보내지 않습니다.'
  },
  theme: {
    title: '화면 테마',
    description: '시스템 설정을 따르면 macOS의 라이트·다크 모드가 바뀔 때 함께 바뀝니다.',
    options: {
      system: '시스템 설정 따르기',
      light: '라이트',
      dark: '다크'
    }
  },
  locale: {
    title: 'UI 언어',
    description: '화면·메뉴바 문구의 언어입니다. 음성 인식과 요약은 계속 한국어로 동작합니다.'
  },
  feedback: {
    title: '피드백 보내기',
    description:
      'GitHub 이슈 작성 화면을 브라우저에서 엽니다. 앱은 아무것도 보내지 않고, 앱 버전과 macOS 버전만 미리 채웁니다. 이슈는 공개되니 회의 내용은 붙여 넣지 마세요.',
    action: 'GitHub에서 작성',
    openError: '브라우저를 열지 못했습니다. 잠시 후 다시 시도해 주세요'
  }
}

export const settingsEn: typeof settingsKo = {
  title: 'Settings',
  toc: 'Settings categories',
  close: 'Close settings',
  loading: 'Loading settings',
  loadError: 'Could not load settings',
  saveError: 'Could not save settings',
  groups: {
    microphone: 'Microphone',
    recording: 'Recording & processing',
    widget: 'Recording widget',
    shortcut: 'Shortcuts',
    dictation: 'Dictation',
    sttModel: 'Speech recognition model',
    update: 'Updates',
    appearance: 'Appearance',
    speech: 'Read aloud',
    language: 'Language',
    feedback: 'Feedback'
  },
  speechVoice: {
    title: 'Voice',
    description:
      'The voice used by the read-aloud button under assistant answers. Choose from the voices installed on macOS.',
    systemDefault: 'Default voice (Korean)'
  },
  inputDevice: {
    title: 'Input device',
    description:
      'The microphone used for recording. If the chosen microphone is not connected, the system default is used.',
    missingWarning:
      'The chosen microphone is not connected. Recording now will use the system default microphone.',
    systemDefault: 'System default microphone',
    previouslyChosen: 'Previously chosen microphone',
    disconnectedSuffix: '(not connected)'
  },
  microphoneTest: {
    title: 'Microphone test',
    description:
      'Check that sound is coming in without recording. Listens through the microphone chosen above.',
    blockedWhileRecording: 'Testing is unavailable while recording. Stop the recording first.',
    start: 'Start test',
    stop: 'Stop test',
    status: {
      idle: '',
      listening: 'Sound is coming in clearly.',
      silent:
        'Almost no sound is detected. The microphone may be muted or a different device may be selected.'
    }
  },
  audioKeep: {
    title: 'Keep original recordings',
    description:
      'When off, the original recording is deleted after the transcript is made. A 16kHz recording takes about 115MB per hour, and meetings without a kept recording cannot be reprocessed later.'
  },
  audioFiles: {
    title: 'Manage recording files',
    description:
      'See every kept recording in one place and delete the ones you no longer need. Only the audio is removed; transcripts stay.',
    manage: 'Manage'
  },
  quietProcessing: {
    title: 'Quiet processing',
    description:
      'Uses only half the CPU while making transcripts to reduce heat and fan noise. Processing takes longer, and meetings already in progress are not affected.'
  },
  widgetPanel: {
    title: 'Recording widget panel',
    description:
      'A small panel floating on the right side of the screen lets you start and stop recording during a meeting. Even when off, you can record and bring the panel back from the menu bar icon or with the shortcuts below.'
  },
  widgetFade: {
    title: 'Translucent widget',
    description:
      'Makes the widget translucent while you use other windows so it covers less of the meeting screen. Click the panel to bring it back into focus.'
  },
  opacity: {
    label: 'Opacity when unfocused'
  },
  recordingShortcut: {
    title: 'Start/stop meeting recording',
    description:
      'Start and stop a meeting recording with this key even while using other apps. Meeting recordings separate speakers.'
  },
  memoShortcut: {
    title: 'Start/stop memo recording',
    description:
      'For notes you speak on your own. Speakers are not separated, so it finishes faster. While recording, either key stops it.'
  },
  widgetShortcut: {
    title: 'Show/hide widget',
    description:
      'Press at least one of ⌘, ⌥ or ⌃ together with a letter, number or symbol key, or press a function key (F1–F24). Press Esc to cancel.'
  },
  dictationShortcut: {
    title: 'Start/stop dictation',
    description:
      'Press this key in another app and speak to insert text at the cursor. Press it again to finish.'
  },
  newChatShortcut: {
    title: 'New chat',
    description:
      'Press this key in the chat window to end the current chat and start over. It does nothing in other apps.'
  },
  shortcutField: {
    changeLabel: ({ title }: { title: string }) => `Change ${title}`,
    pressKeys: 'Press keys…',
    resetTo: ({ accelerator }: { accelerator: string }) => `Reset to ${accelerator}`,
    off: 'Off',
    turnOff: 'Turn off',
    suspendError: 'Could not change shortcut capture state'
  },
  updateCheck: {
    title: 'Check for updates at launch',
    description:
      'Off by default. When on, checks start from the next launch. Meeting content is never sent.'
  },
  theme: {
    title: 'Theme',
    description: 'When following the system, the app switches with macOS light and dark mode.',
    options: {
      system: 'Match system',
      light: 'Light',
      dark: 'Dark'
    }
  },
  locale: {
    title: 'UI language',
    description:
      'The language of on-screen and menu bar text. Speech recognition and summaries keep working in Korean.'
  },
  feedback: {
    title: 'Send feedback',
    description:
      'Opens the GitHub new-issue page in your browser. The app sends nothing and only pre-fills the app and macOS versions. Issues are public, so do not paste meeting content.',
    action: 'Write on GitHub',
    openError: 'Could not open the browser. Please try again shortly'
  }
}
