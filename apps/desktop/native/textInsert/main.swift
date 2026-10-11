// 받아쓰기 조각을 최전면 앱의 커서 자리에 끼워 넣는다 — 클립보드 저장 → 텍스트 쓰기 → ⌘V 키 이벤트 → 클립보드 원복.
// stdin으로 텍스트 전체를 받고(EOF가 시작 신호) stdout에 `ok`, stderr에 `error: …` 한 줄을 쓴다.
// 종료 코드: 0 성공 · 1 그 밖의 실패 · 2 접근성 권한 없음 · 3 보안 입력 활성 · 4 자기 앱이 최전면.
// 규약·설계는 references/architecture.md "받아쓰기" > "끼워 넣기". 빌드는 scripts/setupBin.ts.
import AppKit
import ApplicationServices
import Carbon.HIToolbox
import Foundation

/// 패키징된 앱의 번들 id (electron-builder.yml appId). 메인 창이 맨 앞이면 ⌘V가 자기 창에 들어간다
let SELF_BUNDLE_ID = "com.meetingstt.app"
/// ⌘V가 대상 앱에서 처리될 때까지 기다린 뒤 클립보드를 되돌린다 (docs/dictation-results.md). `--settle-ms=`로 바꿔 잴 수 있다
let DEFAULT_PASTE_SETTLE_MS: UInt32 = 200
/// keyDown과 keyUp 사이. 둘이 같은 틱에 오면 놓치는 앱이 있다
let KEY_HOLD_US: UInt32 = 10_000
let US_PER_MS: UInt32 = 1_000
let V_KEY_CODE = CGKeyCode(kVK_ANSI_V)
let COMMAND_KEY_CODE = CGKeyCode(kVK_Command)

enum ExitCode: Int32 {
  case ok = 0
  case failure = 1
  case accessibility = 2
  case secureInput = 3
  case selfFrontmost = 4
}

func fail(_ reason: String, _ code: ExitCode) -> Never {
  FileHandle.standardError.write("error: \(reason)\n".data(using: .utf8)!)
  exit(code.rawValue)
}

func settleMsOf(_ argv: [String]) -> UInt32 {
  let prefix = "--settle-ms="
  guard let arg = argv.first(where: { $0.hasPrefix(prefix) }),
    let value = UInt32(arg.dropFirst(prefix.count))
  else { return DEFAULT_PASTE_SETTLE_MS }
  return value
}

/// 개발 모드(Electron.app)는 번들 id가 다르므로 부모 프로세스(Electron main) pid로도 본다
func isSelfFrontmost() -> Bool {
  guard let app = NSWorkspace.shared.frontmostApplication else { return false }
  return app.bundleIdentifier == SELF_BUNDLE_ID || app.processIdentifier == getppid()
}

/// 항목·타입을 전부 복사해 둔다. clearContents 뒤에는 원래 항목을 더 읽을 수 없다.
/// Electron `clipboard`로 원복하면 파일 참조·사용자 정의 타입이 사라져 도구 안에서 NSPasteboard 항목 전체로 한다
func snapshotPasteboard(_ pasteboard: NSPasteboard) -> [NSPasteboardItem] {
  (pasteboard.pasteboardItems ?? []).map { item in
    let copy = NSPasteboardItem()
    for type in item.types {
      if let data = item.data(forType: type) { copy.setData(data, forType: type) }
    }
    return copy
  }
}

/// Command 키 자체의 down/up을 함께 보낸다 — V 이벤트에 플래그만 얹으면 프로세스를 새로 띄울 때마다 첫 번째 ⌘V만
/// 들어가고 다음 조각부터는 대상 앱이 받지 않는다 (2026-10-11 TextEdit에서 재현, docs/dictation-results.md 3절)
func postPasteShortcut() -> Bool {
  guard let source = CGEventSource(stateID: .combinedSessionState),
    let commandDown = CGEvent(keyboardEventSource: source, virtualKey: COMMAND_KEY_CODE, keyDown: true),
    let keyDown = CGEvent(keyboardEventSource: source, virtualKey: V_KEY_CODE, keyDown: true),
    let keyUp = CGEvent(keyboardEventSource: source, virtualKey: V_KEY_CODE, keyDown: false),
    let commandUp = CGEvent(keyboardEventSource: source, virtualKey: COMMAND_KEY_CODE, keyDown: false)
  else { return false }
  commandDown.flags = .maskCommand
  keyDown.flags = .maskCommand
  keyUp.flags = .maskCommand
  commandUp.flags = []
  for event in [commandDown, keyDown, keyUp, commandUp] {
    event.post(tap: .cghidEventTap)
    usleep(KEY_HOLD_US)
  }
  return true
}

let text = String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self)
if text.isEmpty { fail("empty", .failure) }
if !AXIsProcessTrusted() { fail("accessibility", .accessibility) }
if IsSecureEventInputEnabled() { fail("secure-input", .secureInput) }
if isSelfFrontmost() { fail("self-frontmost", .selfFrontmost) }

let pasteboard = NSPasteboard.general
let saved = snapshotPasteboard(pasteboard)
pasteboard.clearContents()
pasteboard.setString(text, forType: .string)
let ownChangeCount = pasteboard.changeCount

// 키 이벤트를 못 만들어도 텍스트는 클립보드에 남아 있다. 폴백 안내는 부모(main)가 한다
if !postPasteShortcut() { fail("key-event", .failure) }
usleep(settleMsOf(CommandLine.arguments) * US_PER_MS)

// 기다리는 사이 사용자가 다른 것을 복사했으면 그쪽을 덮어쓰지 않는다
if pasteboard.changeCount == ownChangeCount {
  pasteboard.clearContents()
  if !saved.isEmpty { pasteboard.writeObjects(saved) }
}

print("ok")
exit(ExitCode.ok.rawValue)
