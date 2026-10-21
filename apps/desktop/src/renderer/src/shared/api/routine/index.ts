import type { DeleteRoutineRequest, RunRoutineRequest, SaveRoutineRequest } from '@shared/ipc'

/**
 * @description 루틴 목록과 도는 루틴·대기 중인 루틴을 조회합니다.
 * @returns 루틴 상태
 * @example
 * const { routines, runningId } = await getRoutinesApi()
 */
export const getRoutinesApi = async () => window.api.routines.list()

/**
 * @description 루틴을 만들거나 고칩니다. id가 null이면 새로 만듭니다. 저장하면 다음 실행 기준 시각이 지금으로 바뀝니다.
 * @param routine - 이름·프롬프트·주기·켜기 여부
 * @returns 바뀐 루틴 상태. 형식이 틀리면 main이 거절한다
 * @example
 * await saveRoutineApi({ id: null, name: '아침 브리핑', prompt, schedule, isEnabled: true })
 */
export const saveRoutineApi = async (routine: SaveRoutineRequest) =>
  window.api.routines.save(routine)

/**
 * @description 루틴을 지웁니다. 도는 중이면 끝냅니다.
 * @param id - 루틴 id
 * @returns 바뀐 루틴 상태
 * @example
 * await deleteRoutineApi({ id })
 */
export const deleteRoutineApi = async ({ id }: DeleteRoutineRequest) =>
  window.api.routines.delete({ id })

/**
 * @description 주기와 무관하게 루틴을 지금 실행 큐에 넣습니다.
 * @param id - 루틴 id
 * @returns 바뀐 루틴 상태
 * @example
 * await runRoutineApi({ id })
 */
export const runRoutineApi = async ({ id }: RunRoutineRequest) => window.api.routines.run({ id })
