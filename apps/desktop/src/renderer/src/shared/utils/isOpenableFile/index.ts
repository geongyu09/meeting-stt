/**
 * 에디터가 열 수 있는 바뀐 파일인지 봅니다. main은 작업 폴더 안의 파일을 상대 경로로, 밖의 파일을 절대 경로로 준다.
 * @example
 * isOpenableFile('notes/a.md') // true
 * isOpenableFile('/tmp/a.md') // false
 */
export const isOpenableFile = (filePath: string) =>
  !filePath.startsWith('/') && filePath.toLowerCase().endsWith('.md')
