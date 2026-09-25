import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, isLocale, LOCALE_NAMES, LOCALES, MESSAGES } from './i18n'

type Tree = Record<string, unknown>

/** 잎(문자열·함수)까지 내려가며 경로를 모은다. 타입이 키 누락은 잡지만 빈 문자열은 못 잡는다 */
const collectLeaves = ({ tree, prefix }: { tree: Tree; prefix: string }): string[] =>
  Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string' || typeof value === 'function') return [path]
    if (value && typeof value === 'object')
      return collectLeaves({ tree: value as Tree, prefix: path })

    throw new Error(`사전 잎은 문자열이나 함수여야 합니다: ${path}`)
  })

const readLeaf = ({ tree, path }: { tree: Tree; path: string }) =>
  path.split('.').reduce<unknown>((node, key) => (node as Tree)[key], tree)

describe('i18n', () => {
  it('기본 언어는 한국어이고 지원 언어는 이름을 가진다', () => {
    expect(DEFAULT_LOCALE).toBe('ko')
    expect(LOCALES).toEqual(['ko', 'en'])
    expect(LOCALE_NAMES.ko).toBe('한국어')
    expect(LOCALE_NAMES.en).toBe('English')
  })

  it('isLocale은 지원 언어만 받는다', () => {
    expect(isLocale('ko')).toBe(true)
    expect(isLocale('en')).toBe(true)
    expect(isLocale('ja')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })

  it('영어 사전은 한국어 사전과 같은 키를 가지며 한쪽만 비어 있지 않다', () => {
    const koLeaves = collectLeaves({ tree: MESSAGES.ko, prefix: '' })
    const enLeaves = collectLeaves({ tree: MESSAGES.en, prefix: '' })

    // 순서는 타입이 강제하지 않으니 집합으로 비교한다
    expect(enLeaves.toSorted()).toEqual(koLeaves.toSorted())

    koLeaves.forEach((path) => {
      const ko = readLeaf({ tree: MESSAGES.ko, path })
      const en = readLeaf({ tree: MESSAGES.en, path })

      expect(typeof en, path).toBe(typeof ko)
      // 빈 문구("상태 없음")는 양쪽이 같이 비어야 의도한 것이다
      if (typeof ko === 'string') {
        expect((en as string).trim() === '', path).toBe(ko.trim() === '')
      }
    })
  })

  it('영어 문구에는 한글이 섞이지 않는다 (용어 사전의 한글 읽기 예시 제외)', () => {
    const enLeaves = collectLeaves({ tree: MESSAGES.en, prefix: '' })
    const hangul = /[가-힣]/
    // 용어 사전은 영어 표기의 "한글 읽기"를 적는 곳이라 영어 화면에서도 예시가 한글이다
    const exemptPrefix = 'glossary.'

    enLeaves
      .filter((path) => !path.startsWith(exemptPrefix))
      .forEach((path) => {
        const value = readLeaf({ tree: MESSAGES.en, path })
        if (typeof value === 'string') expect(value, path).not.toMatch(hangul)
      })
  })
})
