interface ToMoveTargetParams {
  from: number
  insertAt: number
}

/**
 * @description "insertAt번째 앞에 놓기"(끝은 길이)를 `moveItem`의 옮긴 뒤 자리로 바꿉니다.
 * 자기 뒤쪽에 놓으면 자기가 빠진 만큼 한 칸 당겨집니다.
 * @param from - 끌고 있는 항목의 자리
 * @param insertAt - 놓을 자리 (0 ~ 길이)
 * @returns 옮긴 뒤의 자리
 * @example
 * toMoveTarget({ from: 0, insertAt: 3 }) // 2
 */
export const toMoveTarget = ({ from, insertAt }: ToMoveTargetParams) =>
  insertAt > from ? insertAt - 1 : insertAt
