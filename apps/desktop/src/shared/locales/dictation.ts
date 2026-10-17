/** 받아쓰기(음성 입력) 문구 — 위젯 패널의 받아쓰기 보기·설정 카테고리·renderer 훅. ko가 타입을 정한다 (references/architecture.md "받아쓰기") */
export const dictationKo = {
  status: {
    listening: '받아쓰는 중',
    recognizing: '글로 바꾸는 중'
  },
  widget: {
    sectionLabel: '받아쓰기',
    stop: '받아쓰기 정지',
    listeningHint: '말이 끊길 때마다 커서 자리에 글이 들어갑니다',
    recognizingHint: '방금 말한 구간을 글로 바꾸는 중입니다',
    clipboardHint: '복사됐습니다. ⌘V로 붙여 넣으세요',
    lastInsertedLabel: '마지막으로 넣은 글',
    levelLabel: '입력 세기'
  },
  settings: {
    title: '받아쓰기',
    usage: {
      title: '사용법',
      description: ({ shortcut }: { shortcut: string }) =>
        `어느 앱에서든 글을 쓸 자리에 커서를 두고 ${shortcut}를 누른 뒤 말하세요. 말이 끊길 때마다 인식한 글이 들어가고, 다시 ${shortcut}를 누르면 끝납니다. 음성은 이 컴퓨터 안에서만 처리되고 저장하지 않습니다.`,
      descriptionOff:
        '단축키가 꺼져 있습니다. 글을 쓸 자리에 커서를 두고 메뉴바 아이콘의 받아쓰기 시작을 누른 뒤 말하세요. 단축키는 설정 → 단축키에서 켤 수 있습니다. 음성은 이 컴퓨터 안에서만 처리되고 저장하지 않습니다.'
    },
    accessibility: {
      title: '접근성 권한',
      granted: '허용됨. 말한 내용이 커서 자리에 바로 들어갑니다.',
      denied:
        '허용되지 않음. 인식한 글을 클립보드에 복사하므로 ⌘V로 붙여 넣어야 합니다. 시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용에서 이 앱을 허용해 주세요.',
      open: '시스템 설정 열기',
      openError:
        '시스템 설정을 열지 못했습니다. 개인정보 보호 및 보안 → 손쉬운 사용에서 직접 허용해 주세요'
    },
    loading: '받아쓰기 상태를 확인하는 중입니다'
  },
  errors: {
    controlFailed: '받아쓰기 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요',
    stateUnavailable: '받아쓰기 상태를 불러오지 못했습니다',
    unknown: '받아쓰기 중 알 수 없는 오류가 발생했습니다'
  }
}

export const dictationEn: typeof dictationKo = {
  status: {
    listening: 'Dictating',
    recognizing: 'Transcribing'
  },
  widget: {
    sectionLabel: 'Dictation',
    stop: 'Stop dictation',
    listeningHint: 'Each time you pause, the text is inserted at the cursor',
    recognizingHint: 'Turning what you just said into text',
    clipboardHint: 'Copied. Press ⌘V to paste',
    lastInsertedLabel: 'Last inserted text',
    levelLabel: 'Input level'
  },
  settings: {
    title: 'Dictation',
    usage: {
      title: 'How to use',
      description: ({ shortcut }) =>
        `In any app, place the cursor where you want to write, press ${shortcut} and start speaking. Each time you pause, the recognized text is inserted. Press ${shortcut} again to finish. Audio is processed on this computer only and is not stored.`,
      descriptionOff:
        'The shortcut is off. Place the cursor where you want to write, choose Start dictation from the menu bar icon and start speaking. You can turn the shortcut on under Settings → Shortcuts. Audio is processed on this computer only and is not stored.'
    },
    accessibility: {
      title: 'Accessibility permission',
      granted: 'Allowed. Spoken text is inserted at the cursor.',
      denied:
        'Not allowed. The recognized text is copied to the clipboard, so you need to press ⌘V to paste it. Allow this app under System Settings → Privacy & Security → Accessibility.',
      open: 'Open System Settings',
      openError:
        'Could not open System Settings. Allow this app manually under Privacy & Security → Accessibility'
    },
    loading: 'Checking dictation status'
  },
  errors: {
    controlFailed: 'Could not send the dictation command. Please try again shortly',
    stateUnavailable: 'Could not load the dictation status',
    unknown: 'An unknown error occurred during dictation'
  }
}
