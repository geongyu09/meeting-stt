import type { DeviceKind, DtypeKind, WhisperModelKind } from '../pipeline/messages'
import type { PipelineProgress } from '../pipeline/runPipeline'
import { STAGE_LABELS } from '../lib/stageLabels'

export const MIN_SPEAKER_COUNT = 1
export const MAX_SPEAKER_COUNT = 20

export interface RunOptions {
  speakerCount: number
  sttDevice: DeviceKind
  sttDtype: DtypeKind
  whisperModel: WhisperModelKind
  diarizeDevice: DeviceKind
}

interface RunPanelProps {
  options: RunOptions
  progress: PipelineProgress | null
  isRunning: boolean
  isReady: boolean
  errorMessage: string | null
  onChange: (options: RunOptions) => void
  onRun: () => void
  onCancel: () => void
}

export default function RunPanel({
  options,
  progress,
  isRunning,
  isReady,
  errorMessage,
  onChange,
  onRun,
  onCancel
}: RunPanelProps) {
  return (
    <section className="panel">
      <h2>실행</h2>

      <div className="options">
        <label>
          참석자 수
          <input
            type="number"
            min={MIN_SPEAKER_COUNT}
            max={MAX_SPEAKER_COUNT}
            value={options.speakerCount}
            disabled={isRunning}
            onChange={(event) => onChange({ ...options, speakerCount: Number(event.target.value) })}
          />
        </label>

        <label>
          STT 장치
          <select
            value={options.sttDevice}
            disabled={isRunning}
            onChange={(event) =>
              onChange({ ...options, sttDevice: event.target.value as DeviceKind })
            }
          >
            <option value="webgpu">WebGPU</option>
            <option value="wasm">WASM</option>
          </select>
        </label>

        <label>
          Whisper 모델
          <select
            value={options.whisperModel}
            disabled={isRunning}
            onChange={(event) =>
              onChange({ ...options, whisperModel: event.target.value as WhisperModelKind })
            }
          >
            <option value="large-v3-turbo">large-v3-turbo</option>
            <option value="small">small</option>
            <option value="tiny">tiny (동작 확인용)</option>
          </select>
        </label>

        <label>
          STT 정밀도
          <select
            value={options.sttDtype}
            disabled={isRunning}
            onChange={(event) =>
              onChange({ ...options, sttDtype: event.target.value as DtypeKind })
            }
          >
            <option value="q4f16">q4f16</option>
            <option value="q4">q4</option>
            <option value="fp32">fp32</option>
          </select>
        </label>

        <label>
          화자 분리 장치
          <select
            value={options.diarizeDevice}
            disabled={isRunning}
            onChange={(event) =>
              onChange({ ...options, diarizeDevice: event.target.value as DeviceKind })
            }
          >
            <option value="wasm">WASM</option>
            <option value="webgpu">WebGPU</option>
          </select>
        </label>
      </div>

      <p className="hint">
        참석자 수를 고정하지 않으면 긴 녹음에서 화자가 무한정 늘어난다 (docs/phase1-results.md).
      </p>

      <div className="actions">
        <button type="button" onClick={onRun} disabled={!isReady || isRunning}>
          회의록 만들기
        </button>
        <button type="button" onClick={onCancel} disabled={!isRunning} className="secondary">
          중단
        </button>
      </div>

      {progress ? (
        <div className="progress">
          <div className="progressBar">
            <div
              className="progressFill"
              style={{ width: `${Math.min(100, progress.percent)}%` }}
            />
          </div>
          <p>
            [{STAGE_LABELS[progress.stage]}] {progress.note} — {progress.percent.toFixed(1)}%
          </p>
        </div>
      ) : null}

      {errorMessage ? <p className="error">{errorMessage}</p> : null}
    </section>
  )
}
