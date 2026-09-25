/**
 * sherpa-onnx-node는 타입 선언을 배포하지 않는다. 화자 재임베딩에 쓰는 부분만 선언한다
 * (references/architecture.md "화자 재군집"). 다른 API가 필요해지면 여기에 더한다.
 */
declare module 'sherpa-onnx-node' {
  export interface WaveObject {
    samples: Float32Array
    sampleRate: number
  }

  export interface SpeakerEmbeddingExtractorConfig {
    model: string
    numThreads?: number
    provider?: string
    debug?: number
  }

  export interface OnlineStream {
    acceptWaveform(wave: WaveObject): void
    inputFinished(): void
  }

  export class SpeakerEmbeddingExtractor {
    constructor(config: SpeakerEmbeddingExtractorConfig)
    readonly dim: number
    createStream(): OnlineStream
    isReady(stream: OnlineStream): boolean
    compute(stream: OnlineStream, enableExternalBuffer?: boolean): Float32Array
  }

  export function readWave(filename: string, enableExternalBuffer?: boolean): WaveObject

  export const version: string
}
