// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ModelDownloadProgressEvent, ModelStatusResponse } from '@shared/ipc'
import type { AssistantStatus } from '@shared/types'

vi.mock('@renderer/shared/api/assistant', () => ({
  getAssistantStatusApi: vi.fn(),
  chooseAssistantFolderApi: vi.fn()
}))
vi.mock('@renderer/shared/api/models', () => ({
  getModelStatusApi: vi.fn(),
  downloadModelsApi: vi.fn(),
  downloadSummaryModelApi: vi.fn()
}))
vi.mock('@renderer/shared/api/recording', () => ({ controlRecordingApi: vi.fn() }))
vi.mock('@renderer/shared/api/events', () => ({
  onModelDownloadProgress: vi.fn(() => () => {}),
  onModelsChanged: vi.fn(() => () => {})
}))

import { chooseAssistantFolderApi, getAssistantStatusApi } from '@renderer/shared/api/assistant'
import { onModelDownloadProgress } from '@renderer/shared/api/events'
import { downloadModelsApi, getModelStatusApi } from '@renderer/shared/api/models'
import { controlRecordingApi } from '@renderer/shared/api/recording'
import SetupSection from './index'

const TURBO_BYTES = 574041195
const VAD_BYTES = 885098

const folderStatusOf = (overrides: Partial<AssistantStatus> = {}): AssistantStatus => ({
  folder: null,
  folderProblem: null,
  isGitRepo: true,
  permissionMode: 'acceptEdits',
  provider: 'claude-cli',
  ...overrides
})

const modelStatusOf = (isInstalled: boolean): ModelStatusResponse => ({
  isReady: isInstalled,
  isSummaryReady: false,
  selectedWhisperModelId: 'turbo-q5',
  recommendedWhisperModelId: 'turbo-q5',
  whisperOptions: [
    { id: 'turbo-q5', label: '기본 (권장)', description: '균형', sizeBytes: TURBO_BYTES },
    { id: 'large-v3-q5', label: '고품질', description: '느림', sizeBytes: 1081140203 },
    { id: 'small-q5_1', label: '저사양', description: '오인식 증가', sizeBytes: 190085487 }
  ],
  items: [
    {
      key: 'whisper',
      label: '음성 인식 모델',
      sizeBytes: TURBO_BYTES,
      isInstalled,
      isRequired: true
    },
    { key: 'vad', label: '무음 감지 모델', sizeBytes: VAD_BYTES, isInstalled, isRequired: true },
    {
      key: 'summary',
      label: '요약 모델',
      sizeBytes: 2497281120,
      isInstalled: false,
      isRequired: false
    }
  ]
})

const renderSection = async ({
  folder = folderStatusOf(),
  models = modelStatusOf(false)
}: { folder?: AssistantStatus; models?: ModelStatusResponse } = {}) => {
  vi.mocked(getAssistantStatusApi).mockResolvedValue(folder)
  vi.mocked(getModelStatusApi).mockResolvedValue(models)

  await act(async () => {
    render(<SetupSection />)
  })
}

/** main이 보내는 다운로드 진행 이벤트를 흉내 낸다 */
const emitProgress = async (event: ModelDownloadProgressEvent) => {
  const listener = vi.mocked(onModelDownloadProgress).mock.calls.at(-1)?.[0]

  await act(async () => {
    listener?.(event)
  })
}

const folderCard = () => screen.getByRole('region', { name: '작업 폴더' })
const modelCard = () => screen.getByRole('region', { name: '음성 인식 모델' })

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SetupSection', () => {
  it('처음 실행이면 인사와 두 카드를 보여 주고 권장 모델을 미리 고른다', async () => {
    await renderSection()

    expect(screen.getByText('처음이시네요. 두 가지만 정하면 바로 시작할 수 있어요.')).toBeTruthy()
    expect(within(folderCard()).getByText('1단계')).toBeTruthy()
    expect(within(folderCard()).getByRole('button', { name: '폴더 고르기' })).toBeTruthy()
    expect(within(modelCard()).getByText('2단계')).toBeTruthy()
    expect(
      (within(modelCard()).getByRole('radio', { name: /기본 \(권장\)/ }) as HTMLInputElement)
        .checked
    ).toBe(true)
    expect(within(modelCard()).getByRole('button', { name: '받기 (575MB)' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('폴더를 고르면 카드가 체크되고 경로가 보인다', async () => {
    const user = userEvent.setup()
    vi.mocked(chooseAssistantFolderApi).mockResolvedValue(
      folderStatusOf({ folder: '/Users/me/notes' })
    )
    await renderSection()

    await user.click(screen.getByRole('button', { name: '폴더 고르기' }))

    expect(within(folderCard()).getByText('완료')).toBeTruthy()
    expect(within(folderCard()).getByText('/Users/me/notes')).toBeTruthy()
    expect(within(folderCard()).getByRole('button', { name: '바꾸기' })).toBeTruthy()
  })

  it('받기를 누르면 합산 진행 줄이 움직이고 끝나면 준비 완료와 녹음 칩이 뜬다', async () => {
    const user = userEvent.setup()
    let finish: (status: ModelStatusResponse) => void = () => {}
    vi.mocked(downloadModelsApi).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    await renderSection({ folder: folderStatusOf({ folder: '/Users/me/notes' }) })

    await user.click(screen.getByRole('button', { name: '받기 (575MB)' }))

    expect(downloadModelsApi).toHaveBeenCalledWith({ whisperModelId: 'turbo-q5' })
    expect(screen.getByText('받는 동안에도 바로 물어볼 수 있어요.')).toBeTruthy()
    await emitProgress({
      key: 'whisper',
      receivedBytes: TURBO_BYTES / 2,
      totalBytes: TURBO_BYTES,
      percent: 50
    })
    expect(screen.getByText('받는 중 · 모델 0/2개 완료')).toBeTruthy()
    expect(
      screen.getByRole('progressbar', { name: '모델 받는 중' }).getAttribute('aria-valuenow')
    ).toBe('50')

    await act(async () => {
      finish(modelStatusOf(true))
    })

    expect(within(modelCard()).getByText('완료')).toBeTruthy()
    expect(within(modelCard()).getByText('기본 (권장) · 574MB · 받기 완료')).toBeTruthy()
    expect(
      screen.getByText('준비가 끝났어요. 이제 바로 물어보거나 녹음을 시작할 수 있어요.')
    ).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '녹음 시작' }))

    expect(controlRecordingApi).toHaveBeenCalledWith({ kind: 'start' })
  })

  it('나중에 받기를 누르면 모델 없이 준비 완료를 알리고 다음에 열 때는 보이지 않는다', async () => {
    const user = userEvent.setup()
    await renderSection({ folder: folderStatusOf({ folder: '/Users/me/notes' }) })

    await user.click(screen.getByRole('button', { name: '나중에 받기' }))

    expect(screen.getByText(/녹음은 모델을 받은 뒤에 할 수 있어요/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '녹음 시작' })).toBeNull()
    expect(screen.getByRole('button', { name: '지금 받기' })).toBeTruthy()

    cleanup()
    await renderSection({ folder: folderStatusOf({ folder: '/Users/me/notes' }) })

    expect(screen.queryByText(/처음이시네요/)).toBeNull()
  })

  it('폴더와 모델이 다 있으면 아무것도 그리지 않는다', async () => {
    await renderSection({
      folder: folderStatusOf({ folder: '/Users/me/notes' }),
      models: modelStatusOf(true)
    })

    expect(screen.queryByText(/처음이시네요/)).toBeNull()
  })

  it('폴더에 문제가 있으면 카드를 체크하지 않고 이유를 알린다', async () => {
    await renderSection({
      folder: folderStatusOf({ folder: '/Users/me/gone', folderProblem: 'missing' }),
      models: modelStatusOf(true)
    })

    expect(within(folderCard()).getByText('1단계')).toBeTruthy()
    expect(within(folderCard()).getByText(/작업 폴더가 없습니다/)).toBeTruthy()
  })
})
