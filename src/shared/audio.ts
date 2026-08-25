/**
 * 녹음·STT가 공유하는 오디오 형식. whisper.cpp와 sherpa-onnx가 모두 16kHz mono 16bit PCM을 요구하므로
 * 녹음 단계에서부터 이 형식으로 맞춰 변환 단계를 없앤다.
 */
export const SAMPLE_RATE_HZ = 16000
export const CHANNELS = 1
export const BITS_PER_SAMPLE = 16

/** AudioWorklet이 한 번에 모아 보내는 샘플 수. 16kHz에서 약 0.5초 분량 */
export const CHUNK_SAMPLES = 8192
