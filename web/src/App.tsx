import { useEffect, useRef, useState } from 'react'

import { probeEnvironment, type EnvironmentInfo } from './lib/environment'
import { loadAudio, type LoadedAudio } from './pipeline/loadAudio'
import { runPipeline, type PipelineProgress, type PipelineResult } from './pipeline/runPipeline'
import AudioPanel from './ui/AudioPanel'
import EnvironmentPanel from './ui/EnvironmentPanel'
import RecordPanel from './ui/RecordPanel'
import RunPanel, { type RunOptions } from './ui/RunPanel'
import TranscriptPanel from './ui/TranscriptPanel'

const DEFAULT_OPTIONS: RunOptions = {
  speakerCount: 3,
  sttDevice: 'webgpu',
  sttDtype: 'q4f16',
  whisperModel: 'large-v3-turbo',
  diarizeDevice: 'wasm'
}

const toMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export default function App() {
  const [environment, setEnvironment] = useState<EnvironmentInfo | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [audio, setAudio] = useState<LoadedAudio | null>(null)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [options, setOptions] = useState<RunOptions>(DEFAULT_OPTIONS)
  const [progress, setProgress] = useState<PipelineProgress | null>(null)
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 환경 확인은 브라우저 API에 묻는 외부 동기화라 마운트 때 한 번만 한다
  useEffect(() => {
    void probeEnvironment().then(setEnvironment)
  }, [])

  const handleSelect = async (selected: File) => {
    setFile(selected)
    setResult(null)
    setProgress(null)
    setErrorMessage(null)
    setIsLoadingAudio(true)

    try {
      setAudio(await loadAudio(selected))
    } catch (error) {
      setAudio(null)
      setErrorMessage(`오디오를 읽지 못했습니다: ${toMessage(error)}`)
    } finally {
      setIsLoadingAudio(false)
    }
  }

  const handleRun = async () => {
    if (!audio || !file) return

    setIsRunning(true)
    setResult(null)
    setErrorMessage(null)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      // 앞선 실행에서 워커로 소유권이 넘어간 채 중단됐으면 배열이 비어 있다
      const ready = audio.samples.length === 0 ? await loadAudio(file) : audio
      setAudio(ready)

      const finished = await runPipeline({
        samples: ready.samples,
        sampleRate: ready.sampleRate,
        speakerCount: options.speakerCount,
        sttDevice: options.sttDevice,
        sttDtype: options.sttDtype,
        whisperModel: options.whisperModel,
        diarizeDevice: options.diarizeDevice,
        onProgress: setProgress,
        signal: controller.signal
      })

      setAudio({ ...ready, samples: finished.samples })
      setResult(finished)
    } catch (error) {
      setErrorMessage(toMessage(error))
    } finally {
      setIsRunning(false)
      abortRef.current = null
    }
  }

  return (
    <main className="app">
      <header>
        <h1>브라우저 STT 프로토타입</h1>
        <p>
          오디오를 서버로 보내지 않는다. 모델만 Hugging Face에서 받고 추론은 전부 이 탭 안에서 한다.
        </p>
      </header>

      <EnvironmentPanel environment={environment} />
      <RecordPanel
        isDisabled={isRunning || isLoadingAudio}
        onRecorded={(recording) => void handleSelect(recording.file)}
      />
      <AudioPanel audio={audio} isLoading={isLoadingAudio} onSelect={handleSelect} />
      <RunPanel
        options={options}
        progress={progress}
        isRunning={isRunning}
        isReady={audio !== null}
        errorMessage={errorMessage}
        onChange={setOptions}
        onRun={handleRun}
        onCancel={() => abortRef.current?.abort()}
      />
      {result && audio ? (
        <TranscriptPanel
          result={result}
          durationSec={audio.durationSec}
          decodeMs={audio.decodeMs}
        />
      ) : null}
    </main>
  )
}
