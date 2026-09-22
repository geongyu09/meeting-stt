import { useEffect, useRef } from 'react'

interface WaveformProps {
  peaks: Float32Array
}

const CANVAS_HEIGHT = 72

/** 파형은 DOM이 아니라 캔버스라 외부 시스템 동기화로 useEffect를 쓴다 */
export default function Waveform({ peaks }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const { width, height } = canvas
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#4c8bf5'

    const middle = height / 2
    for (let x = 0; x < peaks.length; x += 1) {
      const barHeight = Math.max(1, peaks[x] * middle)
      context.fillRect(x, middle - barHeight, 1, barHeight * 2)
    }
  }, [peaks])

  return <canvas ref={canvasRef} width={peaks.length} height={CANVAS_HEIGHT} className="waveform" />
}
