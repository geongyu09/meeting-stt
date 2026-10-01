interface MoveItemParams<T> {
  items: T[]
  from: number
  to: number
}

/**
 * @description 배열에서 한 항목을 다른 자리로 옮긴 새 배열을 만듭니다. 범위를 벗어나면 원래 배열을 돌려줍니다.
 * @param items - 원래 배열
 * @param from - 옮길 항목의 자리
 * @param to - 옮긴 뒤의 자리
 * @returns 새 배열
 * @example
 * moveItem({ items: ['a', 'b', 'c'], from: 0, to: 2 }) // ['b', 'c', 'a']
 */
export const moveItem = <T>({ items, from, to }: MoveItemParams<T>) => {
  const isOutOfRange = (index: number) => index < 0 || index >= items.length
  if (from === to || isOutOfRange(from) || isOutOfRange(to)) return items

  const rest = items.filter((_, index) => index !== from)
  return [...rest.slice(0, to), items[from], ...rest.slice(to)]
}
