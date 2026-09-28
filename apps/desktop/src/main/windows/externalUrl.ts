import { shell } from 'electron'

import { warn } from '../log'

// 앱이 브라우저로 넘기는 링크는 GitHub·모델 저장소 같은 웹 페이지뿐이다. file:·javascript: 같은 스킴은 열지 않는다
const ALLOWED_PROTOCOLS = new Set(['https:'])

export const isAllowedExternalUrl = (url: string) => {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/** 허용한 스킴이면 기본 브라우저로 열고, 아니면 열지 않고 경고를 남긴다 (references/architecture.md "피드백 보내기") */
export const openExternalUrl = async (url: string) => {
  if (!isAllowedExternalUrl(url)) {
    warn(`외부 링크를 열지 않음(허용하지 않는 스킴): ${url}`)

    return false
  }
  await shell.openExternal(url)

  return true
}
