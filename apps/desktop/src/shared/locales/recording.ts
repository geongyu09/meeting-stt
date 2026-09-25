/** 녹음 화면·위젯 패널·녹음 훅 문구. ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const recordingKo = {
  page: {
    title: '새 회의 녹음'
  },
  status: {
    recording: '녹음 중',
    idle: '대기 중'
  },
  speakerCount: {
    label: '참석자 수',
    unknown: '모름',
    hint: '알면 적어 주세요. 비우면 자동으로 나눕니다',
    invalid: ({ min, max }: { min: number; max: number }) =>
      `${min}~${max} 사이의 정수만 쓸 수 있습니다`
  },
  recorder: {
    sectionLabel: '녹음',
    start: '녹음 시작',
    stopAndTranscribe: '녹음 정지하고 회의록 만들기',
    controlError: '녹음 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요',
    keepsRunning: '창을 닫거나 다른 화면으로 옮겨도 녹음은 계속됩니다.',
    widgetHintPrefix: '위젯 패널이나 ',
    widgetHintSuffix: '로도 시작·정지할 수 있습니다.',
    widgetHintPlain: '위젯 패널에서도 시작·정지할 수 있습니다.'
  },
  importer: {
    label: '녹음 파일 가져오기',
    importing: '가져오는 중…',
    hint: '음성 메모·회의 녹화 파일(m4a, mp3, wav, mp4 등)로도 회의록을 만들 수 있습니다. 참석자 수도 함께 적용됩니다.',
    failed: '녹음 파일을 가져오지 못했습니다'
  },
  widget: {
    sectionLabel: '녹음 위젯',
    hide: '위젯 숨기기',
    start: '녹음 시작',
    stop: '녹음 정지',
    modelNotReady: '메인 창에서 모델을 먼저 준비해 주세요',
    stopHint: '정지하면 메인 창에서 회의록을 만듭니다',
    startHint: '회의가 시작되면 녹음을 누르세요'
  },
  errors: {
    permissionDenied: '마이크 사용 권한이 없습니다. 시스템 설정에서 마이크 접근을 허용해 주세요',
    unknown: '녹음 중 알 수 없는 오류가 발생했습니다',
    stateUnavailable: '녹음 상태를 불러오지 못했습니다',
    devicesUnavailable: '마이크 목록을 불러오지 못했습니다',
    microphoneOpenFailed: '마이크를 열지 못했습니다',
    sampleRateUnsupported: ({ expected, actual }: { expected: number; actual: number }) =>
      `이 마이크는 ${expected}Hz 녹음을 지원하지 않습니다 (현재 ${actual}Hz)`
  },
  devices: {
    unnamed: ({ index }: { index: number }) => `마이크 ${index}`
  }
}

export const recordingEn: typeof recordingKo = {
  page: {
    title: 'New recording'
  },
  status: {
    recording: 'Recording',
    idle: 'Idle'
  },
  speakerCount: {
    label: 'Participants',
    unknown: 'Unknown',
    hint: 'Enter it if you know. Leave blank to detect automatically',
    invalid: ({ min, max }) => `Enter a whole number between ${min} and ${max}`
  },
  recorder: {
    sectionLabel: 'Recording',
    start: 'Start recording',
    stopAndTranscribe: 'Stop and create transcript',
    controlError: 'Could not send the recording command. Please try again shortly',
    keepsRunning: 'Recording continues even if you close this window or switch screens.',
    widgetHintPrefix: 'You can also start and stop from the widget panel or with ',
    widgetHintSuffix: '.',
    widgetHintPlain: 'You can also start and stop from the widget panel.'
  },
  importer: {
    label: 'Import a recording',
    importing: 'Importing…',
    hint: 'You can also create a transcript from a voice memo or meeting recording (m4a, mp3, wav, mp4 and more). The participant count applies too.',
    failed: 'Could not import the recording'
  },
  widget: {
    sectionLabel: 'Recording widget',
    hide: 'Hide widget',
    start: 'Start recording',
    stop: 'Stop recording',
    modelNotReady: 'Set up the models in the main window first',
    stopHint: 'Stopping creates the transcript in the main window',
    startHint: 'Press record when the meeting starts'
  },
  errors: {
    permissionDenied: 'Microphone access is not allowed. Allow it in System Settings',
    unknown: 'An unknown error occurred while recording',
    stateUnavailable: 'Could not load the recording state',
    devicesUnavailable: 'Could not load the microphone list',
    microphoneOpenFailed: 'Could not open the microphone',
    sampleRateUnsupported: ({ expected, actual }) =>
      `This microphone does not support ${expected}Hz recording (currently ${actual}Hz)`
  },
  devices: {
    unnamed: ({ index }) => `Microphone ${index}`
  }
}
