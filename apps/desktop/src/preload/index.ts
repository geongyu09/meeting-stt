import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AssistantChatState } from '@shared/types'
import {
  IPC,
  type DeleteRoutineRequest,
  type GetAssistantFolderResponse,
  type GetAssistantStatusResponse,
  type GetRoutinesResponse,
  type InstallHarnessResponse,
  type RoutinesChangedEvent,
  type RunRoutineRequest,
  type SaveRoutineRequest,
  type ListAssistantSkillsResponse,
  type ListWorkspaceFilesResponse,
  type ReadWorkspaceFileRequest,
  type ReadWorkspaceFileResponse,
  type SendAssistantMessageRequest,
  type SetAssistantAutoOrganizeRequest,
  type SetAssistantPermissionModeRequest,
  type SetAssistantProviderRequest,
  type AssistantOpenFileEvent,
  type GetOrganizeStatusRequest,
  type GetOrganizeStatusResponse,
  type OrganizeProgressEvent,
  type WorkspaceFilesChangedEvent,
  type WriteWorkspaceFileRequest,
  type CheckLlmResponse,
  type CheckUpdateResponse,
  type DeleteMeetingRequest,
  type ExportMeetingAudioRequest,
  type ExportMeetingAudioResponse,
  type ImportMeetingAudioResponse,
  type ListMeetingAudioResponse,
  type DeleteMeetingAudioRequest,
  type DeleteMeetingAudioResponse,
  type ReprocessMeetingRequest,
  type GetLlmStatusResponse,
  type SetLlmApiKeyRequest,
  type SetLlmApiKeyResponse,
  type SetLlmProviderRequest,
  type SetLlmProviderResponse,
  type SettingsChangedEvent,
  type SetOpenaiModelRequest,
  type SetOpenaiModelResponse,
  type SetCodexModelRequest,
  type SetCodexModelResponse,
  type DownloadModelsRequest,
  type DownloadModelsResponse,
  type RemoveModelRequest,
  type RemoveModelResponse,
  type DraftGlossaryRequest,
  type DraftGlossaryResponse,
  type GetGlossaryResponse,
  type GetMeetingRequest,
  type GetMeetingResponse,
  type GetMeetingsResponse,
  type GetRecordingStateResponse,
  type GetSettingsResponse,
  type MergeSpeakersRequest,
  type ControlRecordingRequest,
  type ControlDictationRequest,
  type DictationCommandEvent,
  type DictationStateEvent,
  type GetDictationStateResponse,
  type ReportDictationErrorRequest,
  type SendDictationChunkRequest,
  type StartDictationRequest,
  type ModelDownloadProgressEvent,
  type ModelStatusResponse,
  type MutateMeetingResponse,
  type PipelineProgressEvent,
  type CreateSummaryRequest,
  type DeleteSummaryTemplateRequest,
  type DeleteSummaryTemplateResponse,
  type ListSummaryTemplatesResponse,
  type SaveSummaryTemplateRequest,
  type SaveSummaryTemplateResponse,
  type ReassignUtteranceRequest,
  type RevertUtteranceRefineRequest,
  type RecordingCommandEvent,
  type RecordingStateEvent,
  type ReportRecordingErrorRequest,
  type RenameMeetingRequest,
  type RenameSpeakerRequest,
  type RequestMicrophonePermissionResponse,
  type SearchMeetingsRequest,
  type SearchMeetingsResponse,
  type SendRecordingChunkRequest,
  type SetLiveTranscriptRequest,
  type SetRecordingNoteRequest,
  type SetRecordingTypeRequest,
  type SetRecordingPausedRequest,
  type SetSystemAudioRequest,
  type SetSpeakerCountRequest,
  type SetShortcutsSuspendedRequest,
  type SetWidgetVisibleRequest,
  type StartRecordingRequest,
  type StartRecordingResponse,
  type StopRecordingRequest,
  type StopRecordingResponse,
  type DiscardRecordingRequest,
  type RefineProgressEvent,
  type RunRefineRequest,
  type SummaryProgressEvent,
  type UpdateAvailableEvent,
  type UpdateGlossaryRequest,
  type UpdateGlossaryResponse,
  type UpdateSettingsRequest,
  type UpdateSettingsResponse,
  type UpdateMeetingNoteRequest,
  type UpdateUtteranceTextRequest,
  type WriteClipboardTextRequest
} from '@shared/ipc'

// renderer에 노출할 API. ipcRenderer 객체 자체는 노출하지 않고
// 채널별로 타입이 붙은 함수만 여기에 추가한다 (src/shared/ipc.ts 기준).
const api = {
  recording: {
    requestPermission: (): Promise<RequestMicrophonePermissionResponse> =>
      ipcRenderer.invoke(IPC.recording.requestPermission),
    start: (payload: StartRecordingRequest): Promise<StartRecordingResponse> =>
      ipcRenderer.invoke(IPC.recording.start, payload),
    chunk: (payload: SendRecordingChunkRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.recording.chunk, payload),
    stop: (payload: StopRecordingRequest): Promise<StopRecordingResponse> =>
      ipcRenderer.invoke(IPC.recording.stop, payload),
    discard: (payload: DiscardRecordingRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.recording.discard, payload),
    state: (): Promise<GetRecordingStateResponse> => ipcRenderer.invoke(IPC.recording.state),
    control: (payload: ControlRecordingRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.recording.control, payload),
    setSpeakerCount: (payload: SetSpeakerCountRequest): Promise<GetRecordingStateResponse> =>
      ipcRenderer.invoke(IPC.recording.setSpeakerCount, payload),
    reportError: (payload: ReportRecordingErrorRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.recording.reportError, payload),
    setLiveTranscript: (payload: SetLiveTranscriptRequest): Promise<GetRecordingStateResponse> =>
      ipcRenderer.invoke(IPC.recording.setLiveTranscript, payload),
    setSystemAudio: (payload: SetSystemAudioRequest): Promise<GetRecordingStateResponse> =>
      ipcRenderer.invoke(IPC.recording.setSystemAudio, payload),
    setPaused: (payload: SetRecordingPausedRequest): Promise<GetRecordingStateResponse> =>
      ipcRenderer.invoke(IPC.recording.setPaused, payload),
    setNote: (payload: SetRecordingNoteRequest): Promise<GetRecordingStateResponse> =>
      ipcRenderer.invoke(IPC.recording.setNote, payload),
    setType: (payload: SetRecordingTypeRequest): Promise<GetRecordingStateResponse> =>
      ipcRenderer.invoke(IPC.recording.setType, payload)
  },
  // 받아쓰기(음성 입력). 그래프 소유자인 위젯만 start·chunk·stop을 부른다 (references/architecture.md "받아쓰기")
  dictation: {
    state: (): Promise<GetDictationStateResponse> => ipcRenderer.invoke(IPC.dictation.state),
    control: (payload: ControlDictationRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.dictation.control, payload),
    start: (payload: StartDictationRequest): Promise<GetDictationStateResponse> =>
      ipcRenderer.invoke(IPC.dictation.start, payload),
    chunk: (payload: SendDictationChunkRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.dictation.chunk, payload),
    stop: (): Promise<GetDictationStateResponse> => ipcRenderer.invoke(IPC.dictation.stop),
    reportError: (payload: ReportDictationErrorRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.dictation.reportError, payload),
    openAccessibilitySettings: (): Promise<void> =>
      ipcRenderer.invoke(IPC.dictation.openAccessibilitySettings)
  },
  widget: {
    setVisible: (payload: SetWidgetVisibleRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.widget.setVisible, payload)
  },
  shortcuts: {
    setSuspended: (payload: SetShortcutsSuspendedRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.shortcuts.setSuspended, payload)
  },
  meetings: {
    list: (): Promise<GetMeetingsResponse> => ipcRenderer.invoke(IPC.meetings.list),
    get: (payload: GetMeetingRequest): Promise<GetMeetingResponse> =>
      ipcRenderer.invoke(IPC.meetings.get, payload),
    rename: (payload: RenameMeetingRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.meetings.rename, payload),
    delete: (payload: DeleteMeetingRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.meetings.delete, payload),
    search: (payload: SearchMeetingsRequest): Promise<SearchMeetingsResponse> =>
      ipcRenderer.invoke(IPC.meetings.search, payload),
    reprocess: (payload: ReprocessMeetingRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.meetings.reprocess, payload),
    exportAudio: (payload: ExportMeetingAudioRequest): Promise<ExportMeetingAudioResponse> =>
      ipcRenderer.invoke(IPC.meetings.exportAudio, payload),
    import: (): Promise<ImportMeetingAudioResponse> => ipcRenderer.invoke(IPC.meetings.import),
    listAudio: (): Promise<ListMeetingAudioResponse> => ipcRenderer.invoke(IPC.meetings.listAudio),
    deleteAudio: (payload: DeleteMeetingAudioRequest): Promise<DeleteMeetingAudioResponse> =>
      ipcRenderer.invoke(IPC.meetings.deleteAudio, payload),
    updateNote: (payload: UpdateMeetingNoteRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.meetings.updateNote, payload)
  },
  utterances: {
    updateText: (payload: UpdateUtteranceTextRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.utterances.updateText, payload),
    reassign: (payload: ReassignUtteranceRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.utterances.reassign, payload),
    revertRefine: (payload: RevertUtteranceRefineRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.utterances.revertRefine, payload)
  },
  speakers: {
    rename: (payload: RenameSpeakerRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.speakers.rename, payload),
    merge: (payload: MergeSpeakersRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.speakers.merge, payload)
  },
  settings: {
    get: (): Promise<GetSettingsResponse> => ipcRenderer.invoke(IPC.settings.get),
    update: (payload: UpdateSettingsRequest): Promise<UpdateSettingsResponse> =>
      ipcRenderer.invoke(IPC.settings.update, payload)
  },
  feedback: {
    open: (): Promise<void> => ipcRenderer.invoke(IPC.feedback.open)
  },
  assistant: {
    status: (): Promise<GetAssistantStatusResponse> => ipcRenderer.invoke(IPC.assistant.status),
    folder: (): Promise<GetAssistantFolderResponse> => ipcRenderer.invoke(IPC.assistant.folder),
    chooseFolder: (): Promise<GetAssistantStatusResponse> =>
      ipcRenderer.invoke(IPC.assistant.chooseFolder),
    setPermissionMode: (
      payload: SetAssistantPermissionModeRequest
    ): Promise<GetAssistantStatusResponse> =>
      ipcRenderer.invoke(IPC.assistant.setPermissionMode, payload),
    setProvider: (payload: SetAssistantProviderRequest): Promise<GetAssistantStatusResponse> =>
      ipcRenderer.invoke(IPC.assistant.setProvider, payload),
    setAutoOrganize: (
      payload: SetAssistantAutoOrganizeRequest
    ): Promise<GetAssistantStatusResponse> =>
      ipcRenderer.invoke(IPC.assistant.setAutoOrganize, payload),
    state: (): Promise<AssistantChatState> => ipcRenderer.invoke(IPC.assistant.state),
    send: (payload: SendAssistantMessageRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.assistant.send, payload),
    cancel: (): Promise<void> => ipcRenderer.invoke(IPC.assistant.cancel),
    reset: (): Promise<AssistantChatState> => ipcRenderer.invoke(IPC.assistant.reset),
    listFiles: (): Promise<ListWorkspaceFilesResponse> =>
      ipcRenderer.invoke(IPC.assistant.listFiles),
    readFile: (payload: ReadWorkspaceFileRequest): Promise<ReadWorkspaceFileResponse> =>
      ipcRenderer.invoke(IPC.assistant.readFile, payload),
    writeFile: (payload: WriteWorkspaceFileRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.assistant.writeFile, payload),
    listSkills: (): Promise<ListAssistantSkillsResponse> =>
      ipcRenderer.invoke(IPC.assistant.listSkills),
    installHarness: (): Promise<InstallHarnessResponse> =>
      ipcRenderer.invoke(IPC.assistant.installHarness)
  },
  organize: {
    status: (payload: GetOrganizeStatusRequest): Promise<GetOrganizeStatusResponse> =>
      ipcRenderer.invoke(IPC.organize.status, payload)
  },
  routines: {
    list: (): Promise<GetRoutinesResponse> => ipcRenderer.invoke(IPC.routines.list),
    save: (payload: SaveRoutineRequest): Promise<GetRoutinesResponse> =>
      ipcRenderer.invoke(IPC.routines.save, payload),
    delete: (payload: DeleteRoutineRequest): Promise<GetRoutinesResponse> =>
      ipcRenderer.invoke(IPC.routines.delete, payload),
    run: (payload: RunRoutineRequest): Promise<GetRoutinesResponse> =>
      ipcRenderer.invoke(IPC.routines.run, payload)
  },
  clipboard: {
    writeText: (payload: WriteClipboardTextRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.clipboard.writeText, payload)
  },
  summary: {
    create: (payload: CreateSummaryRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.summary.create, payload)
  },
  summaryTemplates: {
    list: (): Promise<ListSummaryTemplatesResponse> =>
      ipcRenderer.invoke(IPC.summaryTemplates.list),
    save: (payload: SaveSummaryTemplateRequest): Promise<SaveSummaryTemplateResponse> =>
      ipcRenderer.invoke(IPC.summaryTemplates.save, payload),
    delete: (payload: DeleteSummaryTemplateRequest): Promise<DeleteSummaryTemplateResponse> =>
      ipcRenderer.invoke(IPC.summaryTemplates.delete, payload)
  },
  refine: {
    run: (payload: RunRefineRequest): Promise<void> => ipcRenderer.invoke(IPC.refine.run, payload)
  },
  glossary: {
    get: (): Promise<GetGlossaryResponse> => ipcRenderer.invoke(IPC.glossary.get),
    update: (payload: UpdateGlossaryRequest): Promise<UpdateGlossaryResponse> =>
      ipcRenderer.invoke(IPC.glossary.update, payload),
    draft: (payload: DraftGlossaryRequest): Promise<DraftGlossaryResponse> =>
      ipcRenderer.invoke(IPC.glossary.draft, payload)
  },
  llm: {
    status: (): Promise<GetLlmStatusResponse> => ipcRenderer.invoke(IPC.llm.status),
    setProvider: (payload: SetLlmProviderRequest): Promise<SetLlmProviderResponse> =>
      ipcRenderer.invoke(IPC.llm.setProvider, payload),
    setApiKey: (payload: SetLlmApiKeyRequest): Promise<SetLlmApiKeyResponse> =>
      ipcRenderer.invoke(IPC.llm.setApiKey, payload),
    setOpenaiModel: (payload: SetOpenaiModelRequest): Promise<SetOpenaiModelResponse> =>
      ipcRenderer.invoke(IPC.llm.setOpenaiModel, payload),
    setCodexModel: (payload: SetCodexModelRequest): Promise<SetCodexModelResponse> =>
      ipcRenderer.invoke(IPC.llm.setCodexModel, payload),
    check: (): Promise<CheckLlmResponse> => ipcRenderer.invoke(IPC.llm.check)
  },
  models: {
    status: (): Promise<ModelStatusResponse> => ipcRenderer.invoke(IPC.models.status),
    download: (payload: DownloadModelsRequest): Promise<DownloadModelsResponse> =>
      ipcRenderer.invoke(IPC.models.download, payload),
    downloadSummary: (): Promise<DownloadModelsResponse> =>
      ipcRenderer.invoke(IPC.models.downloadSummary),
    /** 설정에서 모델 파일 하나를 지운다. `whisper`는 현재 선택된 모델 */
    remove: (payload: RemoveModelRequest): Promise<RemoveModelResponse> =>
      ipcRenderer.invoke(IPC.models.remove, payload)
  },
  update: {
    check: (): Promise<CheckUpdateResponse> => ipcRenderer.invoke(IPC.update.check),
    download: (): Promise<void> => ipcRenderer.invoke(IPC.update.download),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.update.install)
  },
  events: {
    onPipelineProgress: (listener: (event: PipelineProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: PipelineProgressEvent) => listener(payload)
      ipcRenderer.on(IPC.events.progress, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.progress, handler)
      }
    },
    onSummaryProgress: (listener: (event: SummaryProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: SummaryProgressEvent) => listener(payload)
      ipcRenderer.on(IPC.events.summary, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.summary, handler)
      }
    },
    onRefineProgress: (listener: (event: RefineProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: RefineProgressEvent) => listener(payload)
      ipcRenderer.on(IPC.events.refine, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.refine, handler)
      }
    },
    onModelDownloadProgress: (listener: (event: ModelDownloadProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: ModelDownloadProgressEvent) =>
        listener(payload)
      ipcRenderer.on(IPC.events.modelDownload, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.modelDownload, handler)
      }
    },
    onModelsChanged: (listener: () => void) => {
      const handler = () => listener()
      ipcRenderer.on(IPC.events.modelsChanged, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.modelsChanged, handler)
      }
    },
    onRecordingState: (listener: (event: RecordingStateEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: RecordingStateEvent) => listener(payload)
      ipcRenderer.on(IPC.events.recordingState, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.recordingState, handler)
      }
    },
    onRecordingCommand: (listener: (event: RecordingCommandEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: RecordingCommandEvent) => listener(payload)
      ipcRenderer.on(IPC.events.recordingCommand, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.recordingCommand, handler)
      }
    },
    onDictationState: (listener: (event: DictationStateEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: DictationStateEvent) => listener(payload)
      ipcRenderer.on(IPC.events.dictationState, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.dictationState, handler)
      }
    },
    onDictationCommand: (listener: (event: DictationCommandEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: DictationCommandEvent) => listener(payload)
      ipcRenderer.on(IPC.events.dictationCommand, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.dictationCommand, handler)
      }
    },
    onMeetingsChanged: (listener: () => void) => {
      const handler = () => listener()
      ipcRenderer.on(IPC.events.meetingsChanged, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.meetingsChanged, handler)
      }
    },
    onUpdateAvailable: (listener: (event: UpdateAvailableEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: UpdateAvailableEvent) => listener(payload)
      ipcRenderer.on(IPC.events.updateAvailable, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.updateAvailable, handler)
      }
    },
    onSettingsChanged: (listener: (event: SettingsChangedEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: SettingsChangedEvent) => listener(payload)
      ipcRenderer.on(IPC.events.settingsChanged, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.settingsChanged, handler)
      }
    },
    onAssistantState: (listener: (event: AssistantChatState) => void) => {
      const handler = (_: IpcRendererEvent, payload: AssistantChatState) => listener(payload)
      ipcRenderer.on(IPC.events.assistantState, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.assistantState, handler)
      }
    },
    onWorkspaceFilesChanged: (listener: (event: WorkspaceFilesChangedEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: WorkspaceFilesChangedEvent) =>
        listener(payload)
      ipcRenderer.on(IPC.events.assistantFilesChanged, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.assistantFilesChanged, handler)
      }
    },
    onRoutinesChanged: (listener: (event: RoutinesChangedEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: RoutinesChangedEvent) => listener(payload)
      ipcRenderer.on(IPC.events.routinesChanged, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.routinesChanged, handler)
      }
    },
    onAssistantOpenFile: (listener: (event: AssistantOpenFileEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: AssistantOpenFileEvent) => listener(payload)
      ipcRenderer.on(IPC.events.assistantOpenFile, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.assistantOpenFile, handler)
      }
    },
    onOrganizeProgress: (listener: (event: OrganizeProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: OrganizeProgressEvent) => listener(payload)
      ipcRenderer.on(IPC.events.organize, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.organize, handler)
      }
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
