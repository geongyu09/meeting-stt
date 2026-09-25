/**
 * main 프로세스 문구 — 메뉴바·대화상자·renderer가 그대로 보여 주는 오류. ko가 타입을 정한다
 * (references/architecture.md "UI 언어"). 운영 로그·LLM 프롬프트·파일명은 여기 두지 않는다.
 */
export const mainKo = {
  tray: {
    startRecording: '녹음 시작',
    stopRecording: '녹음 정지',
    toggleWidget: '위젯 표시/숨김',
    openMainWindow: '메인 창 열기',
    quit: '종료'
  },
  errors: {
    unknownLocale: '알 수 없는 언어입니다',
    invalidRequest: ({ what }: { what: string }) => `잘못된 요청입니다 (${what} 없음)`,
    fieldEmpty: ({ label }: { label: string }) => `${label}을(를) 비워 둘 수 없습니다`,
    fieldTooLong: ({ label, maxLength }: { label: string; maxLength: number }) =>
      `${label}이(가) 너무 깁니다 (최대 ${maxLength}자)`,
    speakerCountRange: ({ min, max }: { min: number; max: number }) =>
      `참석자 수는 ${min}~${max} 사이의 정수여야 합니다`,
    fadeOpacityRange: ({ min, max }: { min: number; max: number }) =>
      `위젯 불투명도는 ${min}~${max} 사이여야 합니다`,
    shortcutInvalid: '단축키는 ⌘·⌥·⌃ 중 하나 이상과 문자·숫자·기능키를 함께 눌러 지정해 주세요',
    shortcutsMustDiffer: '녹음 단축키와 위젯 단축키를 다르게 지정해 주세요',
    shortcutRegisterFailed: ({ shortcuts }: { shortcuts: string }) =>
      `단축키 ${shortcuts}를 등록하지 못했습니다. 다른 앱이 쓰는 중일 수 있습니다`,
    inputDeviceInvalid: '입력 장치 정보가 올바르지 않습니다',
    unknownRecordingCommand: '알 수 없는 녹음 명령입니다',
    unknownLlmProvider: '알 수 없는 LLM 공급자입니다',
    unknownOpenaiModel: '알 수 없는 GPT 모델입니다',
    unknownWhisperModel: '알 수 없는 음성 인식 모델입니다',
    meetingNotFound: '회의를 찾을 수 없습니다',
    utteranceNotFound: '발화를 찾을 수 없습니다',
    speakerNotInMeeting: '이 회의에 없는 화자입니다',
    sameSpeakerMerge: '같은 화자끼리는 합칠 수 없습니다',
    searchQueryTooLong: ({ maxLength }: { maxLength: number }) =>
      `검색어가 너무 깁니다 (최대 ${maxLength}자)`,
    keychainUnavailable: '이 환경에서는 키를 안전하게 저장할 수 없습니다 (키체인 접근 불가)'
  },
  fields: {
    meetingId: '회의 ID',
    utteranceId: '발화 ID',
    speakerLabel: '화자 라벨',
    meetingTitle: '회의 제목',
    utteranceText: '발화 내용',
    speakerName: '화자 이름',
    clipboardText: '복사할 내용',
    errorMessage: '오류 내용',
    sampleRate: 'sampleRate',
    pcmChunk: 'PCM 청크',
    settingValue: '설정 값',
    searchQuery: '검색어'
  },
  recording: {
    defaultTitle: ({ date }: { date: string }) => `${date} 회의`,
    notActive: '진행 중인 녹음이 아닙니다',
    alreadyActive: '이미 녹음이 진행 중입니다',
    sampleRateUnsupported: ({ expected, actual }: { expected: number; actual: number }) =>
      `이 마이크는 ${expected}Hz 녹음을 지원하지 않습니다 (현재 ${actual}Hz)`,
    tooShort: '녹음이 너무 짧아 회의록을 만들지 못했습니다',
    meetingInfoNotFound: '회의 정보를 찾을 수 없습니다',
    audioMissing: '원본 녹음이 남아 있지 않습니다',
    audioMissingForReprocess: '원본 녹음이 남아 있지 않아 다시 인식할 수 없습니다',
    alreadyProcessing: '이미 처리 중인 회의입니다',
    exportFailed: '녹음 파일을 저장하지 못했습니다. 원본이 지워졌거나 저장 위치에 쓸 수 없습니다'
  },
  dialogs: {
    exportTitle: '녹음 파일 저장',
    wavFilter: 'WAV 오디오',
    importTitle: '녹음 파일 가져오기',
    audioFilter: '오디오·영상 파일'
  },
  importing: {
    unreadable: '이 파일을 읽지 못했습니다. m4a·mp3·wav 같은 오디오 파일인지 확인해 주세요'
  },
  pipeline: {
    audioFileMissing: '녹음 파일을 찾을 수 없습니다',
    interruptedByQuit: '앱이 종료되어 처리가 중단되었습니다',
    binariesMissing: ({ paths }: { paths: string }) =>
      `실행 파일이 없습니다: ${paths}. \`pnpm tsx scripts/setupBin.ts\`로 준비해 주세요`,
    modelsNotReady: ({ labels }: { labels: string }) => `모델이 준비되지 않았습니다: ${labels}`,
    spawnFailed: ({ command }: { command: string }) =>
      `${command} 실행에 실패했습니다. 파일이 있는지 확인해 주세요`,
    exitedAbnormally: ({ command, code }: { command: string; code: number | null }) =>
      `${command} 이(가) 비정상 종료했습니다 (코드 ${code})`,
    whisperJsonUnreadable: 'whisper 결과 JSON을 읽지 못했습니다',
    whisperJsonNoTranscription: 'whisper 결과 JSON에 transcription 배열이 없습니다',
    wavChunkMissing: 'WAV 헤더에 fmt 또는 data 청크가 없습니다',
    wavNot16Bit: '16bit PCM WAV만 정규화할 수 있습니다'
  },
  summary: {
    nothingToSummarize: '요약할 회의록이 없습니다',
    empty: '요약이 비어 있습니다 (회의록이 너무 짧을 수 있습니다)',
    llamaOutputUnreadable: 'llama-cli 결과를 읽지 못했습니다 (출력 형식이 예상과 다릅니다)'
  },
  refine: {
    nothingToRefine: '교정할 회의록이 없습니다',
    glossaryEmpty: '전역 용어 사전이 비어 있습니다. 설정에서 용어를 저장해 주세요'
  },
  glossary: {
    draftEmpty: '용어 초안이 비어 있습니다. 팀 소개를 조금 더 자세히 적어 주세요'
  },
  models: {
    alreadyDownloading: '이미 모델을 내려받는 중입니다',
    downloadFailed: ({ status }: { status: number }) =>
      `모델을 내려받지 못했습니다 (HTTP ${status}). 네트워크를 확인해 주세요`,
    checksumMismatch: '내려받은 파일이 손상되었습니다. 다시 시도해 주세요',
    extractFailed: ({ reason }: { reason: string }) => `압축을 풀지 못했습니다: ${reason}`
  },
  llm: {
    llamaBinaryMissing: '요약 실행 파일(llama-cli)이 준비되지 않았습니다',
    modelNotReady: ({ label }: { label: string }) => `${label}이 준비되지 않았습니다`,
    localReady: ({ label }: { label: string }) => `${label}이 준비되어 있습니다`,
    connected: ({ provider, preview }: { provider: string; preview: string }) =>
      `${provider}에 연결했습니다 (응답: ${preview})`,
    claudeKeyInvalid: 'Claude API 키가 올바르지 않습니다. 설정에서 키를 다시 저장해 주세요',
    claudeRateLimited: 'Claude API 요청 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요',
    claudeUnreachable: 'Anthropic 서버에 연결할 수 없습니다. 네트워크를 확인해 주세요',
    claudeApiError: ({ status, message }: { status: string; message: string }) =>
      `Claude API 오류 (${status}): ${message}`,
    claudeRefused: 'Claude가 이 요청을 처리하지 않았습니다',
    claudeTruncated: 'Claude 답변이 길어 잘렸습니다. 회의록을 나눠 다시 시도해 주세요',
    openaiKeyInvalid: 'OpenAI API 키가 올바르지 않습니다. 설정에서 키를 다시 저장해 주세요',
    openaiQuotaExceeded: 'OpenAI API 요청 한도나 잔액이 부족합니다. 잠시 뒤 다시 시도해 주세요',
    openaiUnreachable: 'OpenAI 서버에 연결할 수 없습니다. 네트워크를 확인해 주세요',
    openaiApiError: ({ status, message }: { status: string; message: string }) =>
      `OpenAI API 오류 (${status}): ${message}`,
    openaiRefused: 'GPT가 이 요청을 처리하지 않았습니다',
    openaiTruncated: 'GPT 답변이 길어 잘렸습니다. 회의록을 나눠 다시 시도해 주세요',
    unknownStatus: '알 수 없음'
  },
  update: {
    devMode: '개발 모드에서는 업데이트를 확인할 수 없습니다',
    checkFailed: '업데이트를 확인하지 못했습니다. 네트워크 연결을 확인해 주세요'
  }
}

export const mainEn: typeof mainKo = {
  tray: {
    startRecording: 'Start recording',
    stopRecording: 'Stop recording',
    toggleWidget: 'Show/hide widget',
    openMainWindow: 'Open main window',
    quit: 'Quit'
  },
  errors: {
    unknownLocale: 'Unknown language',
    invalidRequest: ({ what }) => `Invalid request (missing ${what})`,
    fieldEmpty: ({ label }) => `${label} cannot be empty`,
    fieldTooLong: ({ label, maxLength }) => `${label} is too long (up to ${maxLength} characters)`,
    speakerCountRange: ({ min, max }) =>
      `The number of participants must be a whole number between ${min} and ${max}`,
    fadeOpacityRange: ({ min, max }) => `Widget opacity must be between ${min} and ${max}`,
    shortcutInvalid:
      'A shortcut needs at least one of ⌘, ⌥ or ⌃ together with a letter, number or function key',
    shortcutsMustDiffer: 'The recording and widget shortcuts must be different',
    shortcutRegisterFailed: ({ shortcuts }) =>
      `Could not register the shortcut ${shortcuts}. Another app may be using it`,
    inputDeviceInvalid: 'The input device information is invalid',
    unknownRecordingCommand: 'Unknown recording command',
    unknownLlmProvider: 'Unknown LLM provider',
    unknownOpenaiModel: 'Unknown GPT model',
    unknownWhisperModel: 'Unknown speech recognition model',
    meetingNotFound: 'Meeting not found',
    utteranceNotFound: 'Utterance not found',
    speakerNotInMeeting: 'This speaker is not in the meeting',
    sameSpeakerMerge: 'Cannot merge a speaker with itself',
    searchQueryTooLong: ({ maxLength }) =>
      `The search query is too long (up to ${maxLength} characters)`,
    keychainUnavailable: 'Keys cannot be stored securely in this environment (keychain unavailable)'
  },
  fields: {
    meetingId: 'Meeting ID',
    utteranceId: 'Utterance ID',
    speakerLabel: 'Speaker label',
    meetingTitle: 'Meeting title',
    utteranceText: 'Utterance text',
    speakerName: 'Speaker name',
    clipboardText: 'Text to copy',
    errorMessage: 'Error message',
    sampleRate: 'sampleRate',
    pcmChunk: 'PCM chunk',
    settingValue: 'setting value',
    searchQuery: 'search query'
  },
  recording: {
    defaultTitle: ({ date }) => `Meeting ${date}`,
    notActive: 'This recording is not in progress',
    alreadyActive: 'A recording is already in progress',
    sampleRateUnsupported: ({ expected, actual }) =>
      `This microphone does not support ${expected}Hz recording (currently ${actual}Hz)`,
    tooShort: 'The recording was too short to create a transcript',
    meetingInfoNotFound: 'Meeting information not found',
    audioMissing: 'The original recording is no longer available',
    audioMissingForReprocess:
      'The original recording is no longer available, so it cannot be transcribed again',
    alreadyProcessing: 'This meeting is already being processed',
    exportFailed:
      'Could not save the recording. The original may have been deleted or the destination is not writable'
  },
  dialogs: {
    exportTitle: 'Save recording',
    wavFilter: 'WAV audio',
    importTitle: 'Import recording',
    audioFilter: 'Audio and video files'
  },
  importing: {
    unreadable: 'Could not read this file. Make sure it is an audio file such as m4a, mp3 or wav'
  },
  pipeline: {
    audioFileMissing: 'Recording file not found',
    interruptedByQuit: 'Processing was interrupted because the app quit',
    binariesMissing: ({ paths }) =>
      `Missing executables: ${paths}. Run \`pnpm tsx scripts/setupBin.ts\` to set them up`,
    modelsNotReady: ({ labels }) => `Models are not ready: ${labels}`,
    spawnFailed: ({ command }) => `Failed to run ${command}. Check that the file exists`,
    exitedAbnormally: ({ command, code }) => `${command} exited abnormally (code ${code})`,
    whisperJsonUnreadable: 'Could not read the whisper result JSON',
    whisperJsonNoTranscription: 'The whisper result JSON has no transcription array',
    wavChunkMissing: 'The WAV header has no fmt or data chunk',
    wavNot16Bit: 'Only 16-bit PCM WAV can be normalized'
  },
  summary: {
    nothingToSummarize: 'There is no transcript to summarize',
    empty: 'The summary is empty (the transcript may be too short)',
    llamaOutputUnreadable: 'Could not read the llama-cli output (unexpected format)'
  },
  refine: {
    nothingToRefine: 'There is no transcript to correct',
    glossaryEmpty: 'The glossary is empty. Save some terms in Settings first'
  },
  glossary: {
    draftEmpty: 'The glossary draft is empty. Try describing your team in more detail'
  },
  models: {
    alreadyDownloading: 'A model download is already in progress',
    downloadFailed: ({ status }) =>
      `Could not download the model (HTTP ${status}). Check your network connection`,
    checksumMismatch: 'The downloaded file is corrupted. Please try again',
    extractFailed: ({ reason }) => `Could not extract the archive: ${reason}`
  },
  llm: {
    llamaBinaryMissing: 'The summary executable (llama-cli) is not ready',
    modelNotReady: ({ label }) => `${label} is not ready`,
    localReady: ({ label }) => `${label} is ready`,
    connected: ({ provider, preview }) => `Connected to ${provider} (response: ${preview})`,
    claudeKeyInvalid: 'The Claude API key is invalid. Save the key again in Settings',
    claudeRateLimited: 'The Claude API rate limit was reached. Please try again later',
    claudeUnreachable: 'Could not reach the Anthropic servers. Check your network connection',
    claudeApiError: ({ status, message }) => `Claude API error (${status}): ${message}`,
    claudeRefused: 'Claude declined to process this request',
    claudeTruncated:
      'The Claude response was cut off. Try again with a shorter part of the transcript',
    openaiKeyInvalid: 'The OpenAI API key is invalid. Save the key again in Settings',
    openaiQuotaExceeded:
      'The OpenAI API rate limit or balance has been exhausted. Please try again later',
    openaiUnreachable: 'Could not reach the OpenAI servers. Check your network connection',
    openaiApiError: ({ status, message }) => `OpenAI API error (${status}): ${message}`,
    openaiRefused: 'GPT declined to process this request',
    openaiTruncated:
      'The GPT response was cut off. Try again with a shorter part of the transcript',
    unknownStatus: 'unknown'
  },
  update: {
    devMode: 'Updates cannot be checked in development mode',
    checkFailed: 'Could not check for updates. Check your network connection'
  }
}
