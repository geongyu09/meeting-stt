import { describe, expect, it } from 'vitest'
import { isRemoteError, remoteErrorMessageOf } from './index'

describe('remoteErrorMessageOf', () => {
  it('Electron 브리지 접두어를 떼고 main의 원문만 남긴다', () => {
    expect(
      remoteErrorMessageOf(
        new Error(
          "Error invoking remote method 'recording:start': Error: 받아쓰기 중에는 녹음을 시작할 수 없습니다"
        )
      )
    ).toBe('받아쓰기 중에는 녹음을 시작할 수 없습니다')
  })

  it('접두어가 없으면 그대로 두고, Error가 아니면 문자열로 바꾼다', () => {
    expect(remoteErrorMessageOf(new Error('마이크를 열지 못했습니다'))).toBe(
      '마이크를 열지 못했습니다'
    )
    expect(remoteErrorMessageOf('oops')).toBe('oops')
  })
})

describe('isRemoteError', () => {
  it('브리지를 건너온 에러만 참이다', () => {
    expect(isRemoteError(new Error("Error invoking remote method 'llm:check': 키 없음"))).toBe(true)
    expect(isRemoteError(new TypeError('window.api.llm is undefined'))).toBe(false)
    expect(isRemoteError('text')).toBe(false)
  })
})
