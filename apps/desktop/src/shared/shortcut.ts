/** 설정 화면의 키 입력 변환과 main의 저장 검증이 같은 규칙을 쓰도록 이 파일 하나에 둔다 (references/architecture.md) */

export const DEFAULT_RECORDING_SHORTCUT = 'Alt+Command+R'
export const DEFAULT_WIDGET_SHORTCUT = 'Alt+Command+W'
/** 받아쓰기(음성 입력) 토글 (references/architecture.md "받아쓰기") */
export const DEFAULT_DICTATION_SHORTCUT = 'Alt+Command+D'
/** 채팅 창의 새 대화. 전역 단축키가 아니라 메인 창 안에서만 듣는다 (references/features/ui.md "채팅창 리뉴얼") */
export const DEFAULT_NEW_CHAT_SHORTCUT = 'Command+N'
/** 설정 모달 열기. macOS 관례라 바꿀 수 없고 메인 창 안에서만 듣는다 (references/features/ui.md "설정 모달") */
export const SETTINGS_SHORTCUT = 'Command+,'
/** 꺼진 단축키. 등록하지 않는다 */
export const SHORTCUT_OFF = ''

/** accelerator에 적는 순서이자 macOS 메뉴가 기호를 늘어놓는 순서 */
const MODIFIERS = ['Control', 'Alt', 'Shift', 'Command'] as const
type Modifier = (typeof MODIFIERS)[number]

/** Shift만으로는 일반 타이핑과 겹치므로 이 중 하나는 있어야 한다 */
const REQUIRED_MODIFIERS: Modifier[] = ['Control', 'Alt', 'Command']

const MODIFIER_SYMBOLS: Record<Modifier, string> = {
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Command: '⌘'
}

const ARROW_KEYS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}

/** `KeyboardEvent.code` → Electron accelerator의 한 글자 키 이름 (US 배열 물리 키) */
const PUNCTUATION_KEYS: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/'
}

const KEY_SYMBOLS: Record<string, string> = {
  Space: 'Space',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→'
}

/** Electron accelerator가 아는 기능키 범위 */
const FUNCTION_KEY_COUNT = 24

const isFunctionKey = (key: string) =>
  Array.from({ length: FUNCTION_KEY_COUNT }, (_, index) => `F${index + 1}`).includes(key)

const isMainKey = (key: string) =>
  /^[A-Z0-9]$/.test(key) ||
  key === 'Space' ||
  Object.values(ARROW_KEYS).includes(key) ||
  Object.values(PUNCTUATION_KEYS).includes(key) ||
  isFunctionKey(key)

const isModifier = (part: string): part is Modifier =>
  (MODIFIERS as readonly string[]).includes(part)

/** 허용하는 accelerator인지. 수식키는 중복 없이 정해진 순서로, 마지막에 키 하나. 기능키는 글자를 치지 않아 수식키 없이도 된다 */
export const isValidAccelerator = (accelerator: string) => {
  const parts = accelerator.split('+')
  const key = parts.at(-1) ?? ''
  const modifiers = parts.slice(0, -1)
  if (!isMainKey(key) || !modifiers.every(isModifier)) return false

  const isOrdered = modifiers.every(
    (modifier, index) =>
      index === 0 || MODIFIERS.indexOf(modifier) > MODIFIERS.indexOf(modifiers[index - 1])
  )

  return (
    isOrdered &&
    (isFunctionKey(key) || modifiers.some((modifier) => REQUIRED_MODIFIERS.includes(modifier)))
  )
}

/** 저장할 수 있는 단축키 설정값인지 — 꺼짐 또는 허용하는 accelerator */
export const isValidShortcut = (value: string) =>
  value === SHORTCUT_OFF || isValidAccelerator(value)

/** `KeyboardEvent`에서 필요한 필드만. shared는 DOM 타입에 의존하지 않는다 */
export interface ShortcutKeyInput {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/** `key`가 아니라 `code`를 본다 — ⌥ 조합에서 `key`는 'R'이 아니라 '®'가 된다 */
const keyFromCode = (code: string) => {
  if (/^Key[A-Z]$/.test(code)) return code.slice('Key'.length)
  if (/^Digit[0-9]$/.test(code)) return code.slice('Digit'.length)

  return ARROW_KEYS[code] ?? PUNCTUATION_KEYS[code] ?? code
}

/** 누른 키 조합을 accelerator로 바꾼다. 허용하지 않는 조합(수식키만, Shift만 등)이면 undefined */
export const acceleratorFromKeyInput = ({
  code,
  ctrlKey,
  altKey,
  shiftKey,
  metaKey
}: ShortcutKeyInput) => {
  const pressed: Record<Modifier, boolean> = {
    Control: ctrlKey,
    Alt: altKey,
    Shift: shiftKey,
    Command: metaKey
  }
  const modifiers = MODIFIERS.filter((modifier) => pressed[modifier])
  const accelerator = [...modifiers, keyFromCode(code)].join('+')

  return isValidAccelerator(accelerator) ? accelerator : undefined
}

/** 'Alt+Command+R' → '⌥⌘R' */
export const formatAccelerator = (accelerator: string) =>
  accelerator
    .split('+')
    .map((part) => (isModifier(part) ? MODIFIER_SYMBOLS[part] : (KEY_SYMBOLS[part] ?? part)))
    .join('')
