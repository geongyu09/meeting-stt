/**
 * 처음 실행 설정 카드(`assistant/SetupSection`) 문구 — 작업 폴더·음성 인식 모델·준비 완료.
 * ko가 타입을 정하고 en은 같은 키를 가져야 한다 (references/features/ui.md "채팅창 리뉴얼" > "처음 실행").
 */
export const setupKo = {
  title: '처음 설정',
  greeting: '처음이시네요. 두 가지만 정하면 바로 시작할 수 있어요.',
  stepDone: '완료',
  stepLabel: ({ step }: { step: number }) => `${step}단계`,
  folder: {
    title: '작업 폴더',
    choose: '폴더 고르기',
    change: '바꾸기',
    none: '아직 고르지 않았어요',
    description:
      '비서가 이 폴더의 문서를 읽고 고치며, 이 폴더에 설정된 규칙과 하네스도 그대로 적용돼요. 폴더 경로만 저장해요.',
    chooseError: '작업 폴더를 고르지 못했어요'
  },
  model: {
    title: '음성 인식 모델',
    onlyForRecording: '녹음할 때만 필요해요',
    description: '한 번 받으면 녹음을 이 기기 안에서 글로 옮겨요. 인터넷도 비용도 들지 않아요.',
    legend: '모델 고르기',
    download: ({ size }: { size: string }) => `받기 (${size})`,
    later: '나중에 받기',
    downloading: ({ doneCount, totalCount }: { doneCount: number; totalCount: number }) =>
      `받는 중 · 모델 ${doneCount}/${totalCount}개 완료`,
    progressLabel: '모델 받는 중',
    doneSummary: ({ label, size }: { label: string; size: string }) =>
      `${label} · ${size} · 받기 완료`,
    doneDescription: ({ count }: { count: number }) =>
      `녹음을 이 기기 안에서 글로 옮겨요. 함께 받는 모델 ${count}개도 모두 받았어요.`,
    deferred: '나중에 받기로 했어요. 녹음하려면 모델이 필요해요.',
    downloadNow: '지금 받기'
  },
  ready: {
    withModel: '준비가 끝났어요. 이제 바로 물어보거나 녹음을 시작할 수 있어요.',
    withoutModel:
      '준비가 끝났어요. 이제 바로 물어볼 수 있어요. 녹음은 모델을 받은 뒤에 할 수 있어요.',
    record: '녹음 시작',
    recordError: '녹음을 시작하지 못했어요'
  },
  askWhileDownloading: '받는 동안에도 바로 물어볼 수 있어요.'
}

export const setupEn: typeof setupKo = {
  title: 'First-time setup',
  greeting: 'Looks like your first time. Set two things and you are ready.',
  stepDone: 'Done',
  stepLabel: ({ step }) => `Step ${step}`,
  folder: {
    title: 'Work folder',
    choose: 'Choose folder',
    change: 'Change',
    none: 'Not chosen yet',
    description:
      'The assistant reads and edits documents in this folder, and follows the rules and harness set up there. Only the path is saved.',
    chooseError: 'Could not choose the work folder'
  },
  model: {
    title: 'Speech recognition model',
    onlyForRecording: 'Only needed for recording',
    description:
      'Download it once and recordings are transcribed on this device. No internet, no cost.',
    legend: 'Choose a model',
    download: ({ size }) => `Download (${size})`,
    later: 'Later',
    downloading: ({ doneCount, totalCount }) =>
      `Downloading · ${doneCount}/${totalCount} models done`,
    progressLabel: 'Downloading models',
    doneSummary: ({ label, size }) => `${label} · ${size} · downloaded`,
    doneDescription: ({ count }) =>
      `Recordings are transcribed on this device. The ${count} companion models are downloaded too.`,
    deferred: 'You chose to download later. Recording needs the model.',
    downloadNow: 'Download now'
  },
  ready: {
    withModel: 'All set. Ask anything or start recording.',
    withoutModel: 'All set. Ask anything. Recording works once the model is downloaded.',
    record: 'Start recording',
    recordError: 'Could not start recording'
  },
  askWhileDownloading: 'You can ask while it downloads.'
}
