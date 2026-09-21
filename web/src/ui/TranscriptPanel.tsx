import { useState } from 'react'

import { formatTimestamp, formatTranscript, resolveSpeakerNames } from '../ported/format'
import { formatElapsed, formatRtf, formatSeconds } from '../lib/units'
import type { PipelineResult } from '../pipeline/runPipeline'

interface TranscriptPanelProps {
  result: PipelineResult
  durationSec: number
  decodeMs: number
}

export default function TranscriptPanel({ result, durationSec, decodeMs }: TranscriptPanelProps) {
  const [isCopied, setIsCopied] = useState(false)

  const names = resolveSpeakerNames({
    labels: result.utterances.map((utterance) => utterance.speakerLabel)
  })
  const totalMs =
    decodeMs + result.timings.diarizeMs + result.timings.sttMs + result.timings.mergeMs
  const characterCount = result.utterances.reduce(
    (total, utterance) => total + utterance.text.length,
    0
  )

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatTranscript({ utterances: result.utterances }))
    setIsCopied(true)
  }

  return (
    <section className="panel">
      <h2>결과</h2>

      <table className="measurements">
        <tbody>
          <tr>
            <th>오디오 길이</th>
            <td>{formatSeconds(durationSec)}</td>
            <th>발화 길이 (VAD)</th>
            <td>{formatSeconds(result.speechSec)}</td>
          </tr>
          <tr>
            <th>디코딩 + 정규화</th>
            <td>{formatElapsed(decodeMs)}</td>
            <th>VAD</th>
            <td>{formatElapsed(result.timings.vadMs)}</td>
          </tr>
          <tr>
            <th>화자 분리</th>
            <td>
              {formatElapsed(result.timings.diarizeMs)} (RTF{' '}
              {formatRtf({ elapsedMs: result.timings.diarizeMs, durationSec })})
            </td>
            <th>음성 인식 (VAD 포함)</th>
            <td>
              {formatElapsed(result.timings.sttMs)} (RTF{' '}
              {formatRtf({ elapsedMs: result.timings.sttMs, durationSec })})
            </td>
          </tr>
          <tr>
            <th>전체</th>
            <td>
              {formatElapsed(totalMs)} (RTF {formatRtf({ elapsedMs: totalMs, durationSec })})
            </td>
            <th>병합</th>
            <td>{formatElapsed(result.timings.mergeMs)}</td>
          </tr>
          <tr>
            <th>화자 수</th>
            <td>{Object.keys(names).length}</td>
            <th>임베딩 / 화자 구간</th>
            <td>
              {result.embeddingCount} / {result.speakerSegments.length}
            </td>
          </tr>
          <tr>
            <th>발화 수</th>
            <td>{result.utterances.length}</td>
            <th>글자 수</th>
            <td>{characterCount}</td>
          </tr>
        </tbody>
      </table>

      <div className="actions">
        <button type="button" onClick={handleCopy}>
          회의록 복사
        </button>
        {isCopied ? <span className="hint">복사했다</span> : null}
      </div>

      <ol className="transcript">
        {result.utterances.map((utterance) => (
          <li key={utterance.ord}>
            <span className="time">{formatTimestamp({ sec: utterance.startSec })}</span>
            <span className="speaker">{names[utterance.speakerLabel]}</span>
            <span className="text">{utterance.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
