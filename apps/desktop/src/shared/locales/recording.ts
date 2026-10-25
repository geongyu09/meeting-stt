/** 녹음 카드·위젯 패널·녹음 훅 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const recordingKo = {
  status: {
    recording: '녹음 중',
    paused: '일시정지됨',
    idle: '대기 중'
  },
  pause: {
    pause: '녹음 일시정지',
    resume: '녹음 재개',
    error: '일시정지·재개하지 못했습니다. 잠시 후 다시 시도해 주세요'
  },
  // 녹음 종류 (references/features/assistant.md "녹음 종류 (회의 / 메모)")
  type: {
    label: '녹음 종류',
    meeting: '회의',
    memo: '메모',
    error: '녹음 종류를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요'
  },
  speakerCount: {
    label: '참석자 수',
    short: '참석자',
    unknown: '자동',
    invalid: ({ min, max }: { min: number; max: number }) =>
      `${min}~${max} 사이의 정수만 쓸 수 있습니다`
  },
  // 채팅 입력창 위의 녹음 카드와 입력창의 마이크 버튼 (references/features/recording.md "채팅 창의 녹음")
  recorder: {
    sectionLabel: '녹음',
    start: '녹음 시작',
    micRecording: '녹음 중',
    stop: '정지하고 기록 만들기',
    elapsed: '경과 시간',
    controlError: '녹음 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요',
    keepsRunning: '창을 닫아도 녹음은 계속돼요',
    startedLine: ({ time }: { time: string }) =>
      `${time} · 녹음을 시작했어요. 멈추면 기록으로 정리할게요`,
    recentLabel: '최근 녹음',
    dismissRecent: ({ title }: { title: string }) => `${title} 목록에서 빼기`
  },
  note: {
    toggle: '노트',
    label: '녹음 노트',
    placeholder: '안건, 결정, 링크를 적어 두세요. 교정·요약·기록 정리에 함께 씁니다',
    saveError: '노트를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요'
  },
  live: {
    viewLabel: '보기',
    waveform: '파형',
    transcript: '라이브',
    regionLabel: '라이브 받아쓰기',
    listening: '듣고 있습니다…',
    resourceNotice:
      '미리보기입니다. 말하는 동안 GPU를 계속 써서 발열과 배터리 소모가 늘 수 있어요. 필요 없을 때는 파형으로 두세요',
    toggleError: '보기를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요'
  },
  systemAudio: {
    label: '온라인 회의 소리 함께 녹음',
    hint: 'Zoom·Meet 상대방 목소리도 회의록에 넣습니다. 이어폰을 쓰면 더 정확합니다. 시작 전에 켜 두세요',
    badge: '상대방 소리 포함',
    toggleError: '설정을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요'
  },
  quality: {
    silent: {
      title: '소리가 들어오지 않습니다.',
      advice: '마이크가 음소거됐거나 다른 입력 장치가 선택됐을 수 있습니다.',
      widget: '소리가 들어오지 않습니다. 마이크를 확인해 주세요'
    },
    faint: {
      title: '말소리가 주변 소리에 묻혀 들어옵니다.',
      advice: '마이크를 말하는 사람 가까이 두면 회의록이 더 정확해집니다.',
      widget: '말소리가 잘 들리지 않습니다. 마이크를 가까이 두세요'
    }
  },
  importer: {
    label: '파일로 기록 만들기',
    hint: '다른 앱에서 녹음한 파일을 글로 옮겨요',
    importing: '가져오는 중…',
    failed: '녹음 파일을 가져오지 못했습니다'
  },
  widget: {
    sectionLabel: '녹음 위젯',
    hide: '위젯 숨기기',
    start: '녹음 시작',
    stop: '녹음 정지',
    modelNotReady: '음성 인식 모델을 받으면 녹음할 수 있습니다',
    stopHint: '정지하면 바로 기록을 만들어요',
    pausedHint: '일시정지 동안의 소리는 회의록에 남지 않습니다',
    startHint: '회의가 시작되면 녹음을 누르세요'
  },
  errors: {
    permissionDenied: '마이크 사용 권한이 없습니다. 시스템 설정에서 마이크 접근을 허용해 주세요',
    modelNotReady:
      '녹음하려면 음성 인식 모델이 필요합니다. 설정의 음성 인식 모델에서 내려받아 주세요',
    unknown: '녹음 중 알 수 없는 오류가 발생했습니다',
    stateUnavailable: '녹음 상태를 불러오지 못했습니다',
    devicesUnavailable: '마이크 목록을 불러오지 못했습니다',
    microphoneOpenFailed: '마이크를 열지 못했습니다',
    sampleRateUnsupported: ({ expected, actual }: { expected: number; actual: number }) =>
      `이 마이크는 ${expected}Hz 녹음을 지원하지 않습니다 (현재 ${actual}Hz)`
  },
  files: {
    title: '녹음 파일 관리하기',
    backToSettings: '설정으로',
    loading: '녹음 파일을 불러오는 중입니다',
    loadError: '녹음 파일 목록을 불러오지 못했습니다',
    deleteError: '녹음 파일을 지우지 못했습니다',
    summary: ({ count, size }: { count: number; size: string }) =>
      `보관 중인 녹음 ${count}개 · 총 ${size}`,
    listLabel: '녹음 파일 목록',
    selectAll: '전체 선택',
    selectOne: ({ title }: { title: string }) => `${title} 선택`,
    deleteSelected: ({ count }: { count: number }) => `선택한 ${count}개 삭제`,
    delete: '삭제',
    deleteLabel: ({ title }: { title: string }) => `${title} 녹음 파일 삭제`,
    confirm: ({ count, size }: { count: number; size: string }) =>
      `${count}개(${size})를 지울까요? 회의록은 남고 재생·내보내기·다시 인식을 할 수 없게 됩니다`,
    cancel: '취소',
    failed: ({ count }: { count: number }) => `${count}개를 지우지 못했습니다`,
    status: { error: '처리 실패', processing: '처리 중', missing: '파일 없음' },
    empty: '보관 중인 녹음 파일이 없습니다',
    emptyHint: '원본 녹음 파일 보관을 끄면 회의록을 만든 뒤 녹음을 지웁니다'
  },
  devices: {
    unnamed: ({ index }: { index: number }) => `마이크 ${index}`
  }
}

export const recordingEn: typeof recordingKo = {
  status: {
    recording: 'Recording',
    paused: 'Paused',
    idle: 'Idle'
  },
  pause: {
    pause: 'Pause recording',
    resume: 'Resume recording',
    error: 'Could not pause or resume. Please try again shortly'
  },
  type: {
    label: 'Recording type',
    meeting: 'Meeting',
    memo: 'Memo',
    error: 'Could not change the recording type. Please try again shortly'
  },
  speakerCount: {
    label: 'Participants',
    short: 'Participants',
    unknown: 'Auto',
    invalid: ({ min, max }) => `Enter a whole number between ${min} and ${max}`
  },
  recorder: {
    sectionLabel: 'Recording',
    start: 'Start recording',
    micRecording: 'Recording',
    stop: 'Stop and create record',
    elapsed: 'Elapsed time',
    controlError: 'Could not send the recording command. Please try again shortly',
    keepsRunning: 'Recording continues even if you close this window',
    startedLine: ({ time }) => `${time} · Recording started. Stop to turn it into a record`,
    recentLabel: 'Recent recordings',
    dismissRecent: ({ title }) => `Remove ${title} from the list`
  },
  note: {
    toggle: 'Note',
    label: 'Recording note',
    placeholder:
      'Jot down agenda items, decisions and links. Used for refinement, summary and record organizing',
    saveError: 'Could not save the note. Please try again shortly'
  },
  live: {
    viewLabel: 'View',
    waveform: 'Waveform',
    transcript: 'Live',
    regionLabel: 'Live transcript',
    listening: 'Listening…',
    resourceNotice:
      'This is a preview. It keeps the GPU busy while people talk, which can add heat and drain the battery. Switch to the waveform when you do not need it',
    toggleError: 'Could not switch the view. Please try again shortly'
  },
  systemAudio: {
    label: 'Also record online meeting audio',
    hint: 'Captures what others say in Zoom, Meet and similar apps. Headphones give better results. Turn it on before you start',
    badge: 'Includes speaker audio',
    toggleError: 'Could not change this setting. Please try again shortly'
  },
  quality: {
    silent: {
      title: 'No sound is coming in.',
      advice: 'The microphone may be muted, or a different input device may be selected.',
      widget: 'No sound is coming in. Check the microphone'
    },
    faint: {
      title: 'Voices are getting lost in the background sound.',
      advice: 'Move the microphone closer to the speakers for a more accurate transcript.',
      widget: 'Voices are hard to hear. Move the microphone closer'
    }
  },
  importer: {
    label: 'Create a record from a file',
    hint: 'Turn a recording made in another app into text',
    importing: 'Importing…',
    failed: 'Could not import the recording'
  },
  widget: {
    sectionLabel: 'Recording widget',
    hide: 'Hide widget',
    start: 'Start recording',
    stop: 'Stop recording',
    modelNotReady: 'Download the speech model to start recording',
    stopHint: 'Stopping creates the record right away',
    pausedHint: 'Audio while paused is not included in the transcript',
    startHint: 'Press record when the meeting starts'
  },
  errors: {
    permissionDenied: 'Microphone access is not allowed. Allow it in System Settings',
    modelNotReady:
      'Recording needs the speech recognition model. Download it under Speech recognition model in Settings',
    unknown: 'An unknown error occurred while recording',
    stateUnavailable: 'Could not load the recording state',
    devicesUnavailable: 'Could not load the microphone list',
    microphoneOpenFailed: 'Could not open the microphone',
    sampleRateUnsupported: ({ expected, actual }) =>
      `This microphone does not support ${expected}Hz recording (currently ${actual}Hz)`
  },
  files: {
    title: 'Manage recording files',
    backToSettings: 'Settings',
    loading: 'Loading recording files',
    loadError: 'Could not load the recording files',
    deleteError: 'Could not delete the recording files',
    summary: ({ count, size }) => `${count} kept recordings · ${size} total`,
    listLabel: 'Recording files',
    selectAll: 'Select all',
    selectOne: ({ title }) => `Select ${title}`,
    deleteSelected: ({ count }) => `Delete ${count} selected`,
    delete: 'Delete',
    deleteLabel: ({ title }) => `Delete recording file of ${title}`,
    confirm: ({ count, size }) =>
      `Delete ${count} files (${size})? Transcripts stay, but playback, export and reprocessing will no longer be possible`,
    cancel: 'Cancel',
    failed: ({ count }) => `${count} files could not be deleted`,
    status: { error: 'Failed', processing: 'Processing', missing: 'File missing' },
    empty: 'No recording files are kept',
    emptyHint:
      'Turn off "Keep original recordings" to delete recordings after the transcript is made'
  },
  devices: {
    unnamed: ({ index }) => `Microphone ${index}`
  }
}
