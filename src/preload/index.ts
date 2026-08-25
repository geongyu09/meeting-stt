import { contextBridge } from 'electron'

// renderer에 노출할 API. ipcRenderer 객체 자체는 노출하지 않고
// 채널별로 타입이 붙은 함수만 여기에 추가한다 (src/shared/ipc.ts 기준).
const api = {}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
