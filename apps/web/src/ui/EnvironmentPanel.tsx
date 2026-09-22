import type { EnvironmentInfo } from '../lib/environment'
import type { ModelCacheInfo } from '../lib/modelCache'
import { formatGb } from '../lib/units'

interface EnvironmentPanelProps {
  environment: EnvironmentInfo | null
  modelCache: ModelCacheInfo | null
}

const yesNo = (value: boolean) => (value ? '예' : '아니오')

/**
 * 진행률 문구는 캐시에서 읽을 때도 "내려받는 중"이라 구분이 안 된다 (계획 §7).
 * 실행 전에 무엇을 받아야 하는지 여기서 알려 준다.
 */
const cacheSummary = (modelCache: ModelCacheInfo | null) => {
  if (!modelCache) return '확인하는 중…'
  if (!modelCache.isReadable) return '확인할 수 없음 (시크릿 창이거나 캐시가 막혀 있다)'

  const { cachedCount, totalCount, missingLabels } = modelCache
  if (cachedCount === totalCount)
    return `받아 둠 (${cachedCount}/${totalCount}) — 네트워크 없이 시작한다`

  return `${cachedCount}/${totalCount} — ${missingLabels.join(', ')}을(를) 받아야 한다`
}

export default function EnvironmentPanel({ environment, modelCache }: EnvironmentPanelProps) {
  if (!environment) return <section className="panel">환경을 확인하는 중…</section>

  const { webGpu } = environment
  const isFullyCached = modelCache?.isReadable && modelCache.cachedCount === modelCache.totalCount

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

        <dt>모델 캐시</dt>
        <dd className={isFullyCached ? 'good' : 'warn'}>{cacheSummary(modelCache)}</dd>

        <dt>메모리 측정</dt>
        <dd className={environment.isMemoryMeasurable ? 'good' : 'warn'}>
          {environment.isMemoryMeasurable
            ? '가능 — 실행이 끝나면 결과표에 피크가 찍힌다'
            : '불가 — VITE_COEP=1로 띄워야 잰다 (crossOriginIsolated 필요)'}
        </dd>

        <dt>영구 저장</dt>
        <dd className={environment.isStoragePersisted ? 'good' : 'warn'}>
          {yesNo(environment.isStoragePersisted)}
          {environment.isStoragePersisted ? '' : ' — 디스크가 빠듯하면 모델 캐시가 지워질 수 있다'}
        </dd>
      </dl>
    </section>
  )
}
