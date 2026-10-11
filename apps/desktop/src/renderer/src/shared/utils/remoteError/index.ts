/** Electron은 main에서 던진 에러를 "Error invoking remote method '<채널>': Error: <원문>"으로 감싼다 */
const REMOTE_ERROR_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?/

/** main이 던진(브리지를 건너온) 에러인지. renderer 쪽 TypeError 같은 것은 아니다 */
export const isRemoteError = (caught: unknown): caught is Error =>
  caught instanceof Error && REMOTE_ERROR_PREFIX.test(caught.message)

/** main이 던진 한국어 안내 원문만 남긴다. 사용자에게 그대로 보여 줄 수 있는 문구다 */
export const remoteErrorMessageOf = (caught: unknown) =>
  caught instanceof Error ? caught.message.replace(REMOTE_ERROR_PREFIX, '') : String(caught)
