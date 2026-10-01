import type { DeleteSummaryTemplateRequest, SaveSummaryTemplateRequest } from '@shared/ipc'

/**
 * @description 요약 템플릿 목록을 불러옵니다. 내장 기본 템플릿이 맨 앞, 나머지는 만든 순입니다.
 * @returns 요약 템플릿 목록
 * @example
 * const templates = await getSummaryTemplatesApi()
 */
export const getSummaryTemplatesApi = async () => window.api.summaryTemplates.list()

/**
 * @description 요약 템플릿을 저장합니다. id가 없으면 새로 만들고, 내장 기본 템플릿은 거절됩니다.
 * @param id - 고칠 템플릿 id. 새 템플릿이면 생략
 * @param name - 템플릿 이름 (1~30자)
 * @param blocks - 위에서부터 쌓은 블록 (1~10개)
 * @returns 갱신된 템플릿 목록
 * @example
 * const templates = await saveSummaryTemplateApi({ name: '주간 회의', blocks })
 */
export const saveSummaryTemplateApi = async ({ id, name, blocks }: SaveSummaryTemplateRequest) =>
  window.api.summaryTemplates.save({ ...(id ? { id } : {}), name, blocks })

/**
 * @description 요약 템플릿을 삭제합니다. 이미 만든 요약은 그대로 남습니다.
 * @param id - 템플릿 id
 * @returns 갱신된 템플릿 목록
 * @example
 * const templates = await deleteSummaryTemplateApi({ id })
 */
export const deleteSummaryTemplateApi = async ({ id }: DeleteSummaryTemplateRequest) =>
  window.api.summaryTemplates.delete({ id })
