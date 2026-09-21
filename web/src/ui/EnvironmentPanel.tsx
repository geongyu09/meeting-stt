import type { EnvironmentInfo } from '../lib/environment'
import { formatGb } from '../lib/units'

interface EnvironmentPanelProps {
  environment: EnvironmentInfo | null
}

const yesNo = (value: boolean) => (value ? '예' : '아니오')

export default function EnvironmentPanel({ environment }: EnvironmentPanelProps) {
  if (!environment) return <section className="panel">환경을 확인하는 중…</section>

  const { webGpu } = environment

  return (
    <section className="panel">
      <h2>환경</h2>
      <dl className="facts">
        <dt>WebGPU 어댑터</dt>
        <dd className={webGpu.isAvailable ? 'good' : 'bad'}>
          {webGpu.isAvailable
            ? `${webGpu.vendor ?? '알 수 없음'} / ${webGpu.architecture ?? '알 수 없음'}`
            : `없음 (${webGpu.reason ?? '이유 불명'})`}
        </dd>

        <dt>shader-f16</dt>
        <dd className={webGpu.hasShaderF16 ? 'good' : 'warn'}>
          {yesNo(webGpu.hasShaderF16)}
          {webGpu.hasShaderF16 ? '' : ' — q4f16 대신 q4를 써야 한다'}
        </dd>

        <dt>최대 GPU 버퍼</dt>
        <dd>{webGpu.maxBufferMb ? `${webGpu.maxBufferMb}MB` : '—'}</dd>

        <dt>crossOriginIsolated</dt>
        <dd className={environment.isCrossOriginIsolated ? 'good' : 'warn'}>
          {yesNo(environment.isCrossOriginIsolated)}
          {environment.isCrossOriginIsolated ? '' : ' — WASM은 1스레드로 돈다'}
        </dd>

        <dt>논리 코어</dt>
        <dd>{environment.hardwareConcurrency}</dd>

        <dt>deviceMemory</dt>
        <dd>{environment.deviceMemoryGb ? `${environment.deviceMemoryGb}GB` : '—'}</dd>

        <dt>저장소 여유</dt>
        <dd>
          {environment.storageQuotaBytes
            ? `${formatGb(environment.storageUsageBytes ?? 0)} / ${formatGb(environment.storageQuotaBytes)}`
            : '—'}
        </dd>
      </dl>
    </section>
  )
}
