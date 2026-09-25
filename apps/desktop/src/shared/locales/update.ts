/** 업데이트 배너·"지금 확인" 문구 (features/update, useUpdate). ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/architecture.md "UI 언어") */
export const updateKo = {
  errors: {
    check: '업데이트를 확인하지 못했습니다',
    download: '새 버전을 내려받지 못했습니다',
    install: '새 버전을 설치하지 못했습니다'
  },
  actions: {
    downloading: '내려받는 중',
    checking: '확인 중',
    install: '다시 시작해 설치',
    retry: '다시 시도',
    download: '받기',
    checkNow: '지금 확인'
  },
  banner: {
    available: ({ version }: { version: string }) => `새 버전 ${version}이 있습니다.`,
    downloaded: ' 내려받기가 끝났습니다.'
  },
  check: {
    checking: '새 버전을 확인하는 중입니다',
    latest: ({ version }: { version: string | null }) => `최신 버전(${version})을 쓰고 있습니다`,
    downloaded: ({ version }: { version: string }) => `새 버전 ${version}을 내려받았습니다`,
    available: ({ version }: { version: string }) => `새 버전 ${version}이 있습니다`,
    idle: '설정과 관계없이 지금 새 버전이 있는지 확인합니다'
  }
}

export const updateEn: typeof updateKo = {
  errors: {
    check: 'Could not check for updates',
    download: 'Could not download the new version',
    install: 'Could not install the new version'
  },
  actions: {
    downloading: 'Downloading',
    checking: 'Checking',
    install: 'Restart to install',
    retry: 'Try again',
    download: 'Download',
    checkNow: 'Check now'
  },
  banner: {
    available: ({ version }: { version: string }) => `Version ${version} is available.`,
    downloaded: ' Download finished.'
  },
  check: {
    checking: 'Checking for a new version',
    latest: ({ version }: { version: string | null }) =>
      `You are on the latest version (${version})`,
    downloaded: ({ version }: { version: string }) => `Version ${version} has been downloaded`,
    available: ({ version }: { version: string }) => `Version ${version} is available`,
    idle: 'Checks for a new version right now, regardless of the setting'
  }
}
