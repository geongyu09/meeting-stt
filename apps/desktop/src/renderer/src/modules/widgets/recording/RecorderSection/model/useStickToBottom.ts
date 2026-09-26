import { useEffect, useRef } from 'react'

/** 바닥에서 이만큼 안쪽이면 바닥에 붙어 있는 것으로 본다 */
const STICK_THRESHOLD_PX = 24

/**
 * 새 글자가 오면 맨 아래로 스크롤한다. 사용자가 위로 올려 읽는 중이면 따라가지 않는다
 * (references/architecture.md "라이브 받아쓰기").
 */
const useStickToBottom = ({ contentKey }: { contentKey: string }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const isPinnedRef = useRef(true)

  const handleScroll = () => {
    const container = containerRef.current
    if (!container) return

    const distance = container.scrollHeight - container.scrollTop - container.clientHeight
    isPinnedRef.current = distance <= STICK_THRESHOLD_PX
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container || !isPinnedRef.current) return

    container.scrollTop = container.scrollHeight
  }, [contentKey])

  return { containerRef, handleScroll }
}

export default useStickToBottom
