/** S0 환경 확인. 프로토타입이 돌아갈 조건이 갖춰졌는지 한눈에 본다 */

import { probeWebGpu, type WebGpuInfo } from './webgpu'

export interface EnvironmentInfo {
  /** true면 WASM 멀티스레드를 쓸 수 있다. COOP/COEP 헤더가 있어야 한다 */
  isCrossOriginIsolated: boolean
  hardwareConcurrency: number
  deviceMemoryGb?: number
  storageQuotaBytes?: number
  storageUsageBytes?: number
  webGpu: WebGpuInfo
  userAgent: string
}

export const probeEnvironment = async (): Promise<EnvironmentInfo> => {
  const estimate = navigator.storage?.estimate
    ? await navigator.storage.estimate().catch(() => null)
    : null

  return {
    isCrossOriginIsolated: globalThis.crossOriginIsolated,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    storageQuotaBytes: estimate?.quota,
    storageUsageBytes: estimate?.usage,
    webGpu: await probeWebGpu(),
    userAgent: navigator.userAgent
  }
}
