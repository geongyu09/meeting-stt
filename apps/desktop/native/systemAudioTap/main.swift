// 시스템 오디오(스피커로 나가는 모든 프로세스의 소리)를 Core Audio Taps(macOS 14.2+)로 잡아
// 16kHz mono Float32LE PCM을 stdout으로 흘려보낸다. 상태·오류는 stderr에 한 줄씩 쓴다.
// stdin이 닫히거나 SIGTERM을 받으면 정리하고 종료한다 (부모 Electron이 죽어도 남지 않는다).
// 규약·설계는 references/architecture.md "시스템 오디오 캡처" 절. 빌드는 scripts/setupBin.ts.
import AVFoundation
import CoreAudio
import Foundation

/// `@shared/audio`의 SAMPLE_RATE_HZ와 같은 값이어야 main이 리샘플링 없이 섞는다
let OUTPUT_SAMPLE_RATE_HZ = 16000.0
let OUTPUT_CHANNELS: AVAudioChannelCount = 1
/// 벽시계보다 이만큼 뒤처지면 0으로 채운다. 첫 실행은 탭이 만들어진 뒤 몇 초 동안 버퍼가 오지 않는다
let GAP_FILL_THRESHOLD_SEC = 0.1
/// 콜백이 아예 멈췄을 때도 스트림이 이어지도록 주기적으로 부족분을 채운다
let FILL_TIMER_INTERVAL_SEC = 0.5

let standardError = FileHandle.standardError
let standardOutput = FileHandle.standardOutput
let writeQueue = DispatchQueue(label: "systemAudioTap.write")
let ioQueue = DispatchQueue(label: "systemAudioTap.io")

func log(_ message: String) {
  standardError.write((message + "\n").data(using: .utf8)!)
}

func fail(_ message: String, _ status: OSStatus) -> Never {
  log("error: \(message) (OSStatus \(status))")
  exit(1)
}

func propertyAddress(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(
    mSelector: selector,
    mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain
  )
}

func defaultOutputDeviceID() -> AudioDeviceID {
  var address = propertyAddress(kAudioHardwarePropertyDefaultOutputDevice)
  var deviceID = AudioDeviceID(kAudioObjectUnknown)
  var size = UInt32(MemoryLayout<AudioDeviceID>.size)
  let status = AudioObjectGetPropertyData(
    AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &deviceID)
  if status != noErr { fail("기본 출력 장치를 찾지 못했습니다", status) }
  return deviceID
}

func deviceUID(_ deviceID: AudioDeviceID) -> String {
  var address = propertyAddress(kAudioDevicePropertyDeviceUID)
  var uid: CFString = "" as CFString
  var size = UInt32(MemoryLayout<CFString>.size)
  let status = withUnsafeMutablePointer(to: &uid) { pointer in
    AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, pointer)
  }
  if status != noErr { fail("출력 장치 UID를 읽지 못했습니다", status) }
  return uid as String
}

/// stdout에 쓰는 유일한 곳. 프로세스 시작 시각을 기준으로 "지금까지 내보냈어야 할 샘플 수"를 맞춘다
final class OutputClock {
  private let startedAt = ProcessInfo.processInfo.systemUptime
  private var emittedFrames = 0
  private let thresholdFrames = Int(GAP_FILL_THRESHOLD_SEC * OUTPUT_SAMPLE_RATE_HZ)

  private func expectedFrames() -> Int {
    Int((ProcessInfo.processInfo.systemUptime - startedAt) * OUTPUT_SAMPLE_RATE_HZ)
  }

  /// writeQueue에서만 부른다. `isFinal`이면 문턱 없이 남은 구간을 전부 채운다 (종료 직전)
  func fillGap(beforeWriting incomingFrames: Int, isFinal: Bool = false) {
    let deficit = expectedFrames() - emittedFrames - incomingFrames
    guard deficit > (isFinal ? 0 : thresholdFrames) else { return }

    standardOutput.write(Data(count: deficit * MemoryLayout<Float>.size))
    emittedFrames += deficit
  }

  /// writeQueue에서만 부른다
  func write(_ data: Data) {
    let frames = data.count / MemoryLayout<Float>.size
    fillGap(beforeWriting: frames)
    standardOutput.write(data)
    emittedFrames += frames
  }
}

let clock = OutputClock()

/// 탭 하나 + 그 탭을 물린 비공개 집계 장치 + IOProc. 기본 출력 장치가 바뀌면 통째로 다시 만든다
final class Capture {
  private var tapID = AudioObjectID(kAudioObjectUnknown)
  private var aggregateID = AudioObjectID(kAudioObjectUnknown)
  private var procID: AudioDeviceIOProcID?
  private var converter: AVAudioConverter?
  private var inputFormat: AVAudioFormat?
  private let outputFormat = AVAudioFormat(
    commonFormat: .pcmFormatFloat32, sampleRate: OUTPUT_SAMPLE_RATE_HZ,
    channels: OUTPUT_CHANNELS, interleaved: true)!

  func start() {
    let tapDescription = CATapDescription(monoGlobalTapButExcludeProcesses: [])
    tapDescription.uuid = UUID()
    tapDescription.name = "meeting-stt system audio"
    tapDescription.isPrivate = true
    tapDescription.muteBehavior = .unmuted

    var status = AudioHardwareCreateProcessTap(tapDescription, &tapID)
    if status != noErr { fail("시스템 오디오 탭을 만들지 못했습니다", status) }

    let outputDevice = defaultOutputDeviceID()
    let description: [String: Any] = [
      kAudioAggregateDeviceNameKey: "meeting-stt system audio",
      kAudioAggregateDeviceUIDKey: UUID().uuidString,
      kAudioAggregateDeviceIsPrivateKey: true,
      kAudioAggregateDeviceIsStackedKey: false,
      kAudioAggregateDeviceTapAutoStartKey: true,
      kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: deviceUID(outputDevice)]],
      kAudioAggregateDeviceTapListKey: [
        [
          kAudioSubTapDriftCompensationKey: true,
          kAudioSubTapUIDKey: tapDescription.uuid.uuidString
        ]
      ]
    ]
    status = AudioHardwareCreateAggregateDevice(description as CFDictionary, &aggregateID)
    if status != noErr { fail("집계 장치를 만들지 못했습니다", status) }

    rebuildConverter()
    // 출력 장치의 샘플레이트는 재생 중에도 바뀐다(실측: 48kHz → 24kHz). 탭 형식 속성은 그대로라 집계 장치 쪽을 듣는다
    var rateAddress = propertyAddress(kAudioDevicePropertyNominalSampleRate)
    status = AudioObjectAddPropertyListenerBlock(aggregateID, &rateAddress, ioQueue) {
      [weak self] _, _ in
      self?.rebuildConverter()
    }
    if status != noErr { log("warn: 샘플레이트 변경을 감시하지 못합니다 (OSStatus \(status))") }

    status = AudioDeviceCreateIOProcIDWithBlock(&procID, aggregateID, ioQueue) {
      [weak self] _, inputData, _, _, _ in
      self?.handle(inputData)
    }
    if status != noErr { fail("IOProc을 만들지 못했습니다", status) }

    status = AudioDeviceStart(aggregateID, procID)
    if status != noErr { fail("집계 장치를 시작하지 못했습니다", status) }
  }

  /// 채널·샘플 형식은 탭 형식에서, 샘플레이트는 집계 장치의 현재 값에서 읽는다.
  /// 탭 형식 속성은 만들 때 값(48kHz)에 머무는데 실제 콜백 데이터는 장치 속도(24kHz 등)를 따른다
  private func rebuildConverter() {
    var formatAddress = propertyAddress(kAudioTapPropertyFormat)
    var streamDescription = AudioStreamBasicDescription()
    var formatSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
    var status = AudioObjectGetPropertyData(
      tapID, &formatAddress, 0, nil, &formatSize, &streamDescription)
    if status != noErr { fail("탭 형식을 읽지 못했습니다", status) }

    var rateAddress = propertyAddress(kAudioDevicePropertyNominalSampleRate)
    var nominalRate = 0.0
    var rateSize = UInt32(MemoryLayout<Double>.size)
    status = AudioObjectGetPropertyData(aggregateID, &rateAddress, 0, nil, &rateSize, &nominalRate)
    if status == noErr && nominalRate > 0 { streamDescription.mSampleRate = nominalRate }

    guard let input = AVAudioFormat(streamDescription: &streamDescription),
      let audioConverter = AVAudioConverter(from: input, to: outputFormat)
    else {
      fail("탭 형식을 변환할 수 없습니다", -1)
    }
    inputFormat = input
    converter = audioConverter
    log("format: \(input.sampleRate)Hz \(input.channelCount)ch -> \(OUTPUT_SAMPLE_RATE_HZ)Hz mono")
  }

  private func handle(_ inputData: UnsafePointer<AudioBufferList>) {
    guard let inputFormat, let converter else { return }
    guard
      let inputBuffer = AVAudioPCMBuffer(
        pcmFormat: inputFormat, bufferListNoCopy: inputData, deallocator: nil),
      inputBuffer.frameLength > 0
    else { return }

    let ratio = OUTPUT_SAMPLE_RATE_HZ / inputFormat.sampleRate
    let capacity = AVAudioFrameCount(Double(inputBuffer.frameLength) * ratio) + 64
    guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity)
    else { return }

    // 샘플레이트 변환기는 입력 블록을 여러 번 부를 수 있다. 버퍼는 한 번만 주고 그 뒤에는 "지금은 없음"으로 답한다
    var isConsumed = false
    var error: NSError?
    let status = converter.convert(to: outputBuffer, error: &error) { _, outStatus in
      if isConsumed {
        outStatus.pointee = .noDataNow
        return nil
      }
      isConsumed = true
      outStatus.pointee = .haveData
      return inputBuffer
    }
    if status == .error {
      log("warn: 변환 실패 \(error?.localizedDescription ?? "")")
      return
    }
    guard outputBuffer.frameLength > 0, let channel = outputBuffer.floatChannelData else { return }

    let bytes = Int(outputBuffer.frameLength) * MemoryLayout<Float>.size
    let data = Data(bytes: channel[0], count: bytes)
    writeQueue.async { clock.write(data) }
  }

  func stop() {
    if let procID, aggregateID != kAudioObjectUnknown {
      AudioDeviceStop(aggregateID, procID)
      AudioDeviceDestroyIOProcID(aggregateID, procID)
    }
    procID = nil
    if aggregateID != kAudioObjectUnknown { AudioHardwareDestroyAggregateDevice(aggregateID) }
    aggregateID = AudioObjectID(kAudioObjectUnknown)
    if tapID != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tapID) }
    tapID = AudioObjectID(kAudioObjectUnknown)
  }

  /// 기본 출력 장치가 바뀌면(이어폰 연결 등) 집계 장치의 시계가 끊기므로 다시 만든다
  func restart() {
    stop()
    start()
    log("restarted: 기본 출력 장치가 바뀌어 다시 시작했습니다")
  }
}

let capture = Capture()
capture.start()

var outputAddress = propertyAddress(kAudioHardwarePropertyDefaultOutputDevice)
let listenerStatus = AudioObjectAddPropertyListenerBlock(
  AudioObjectID(kAudioObjectSystemObject), &outputAddress, ioQueue
) { _, _ in
  capture.restart()
}
if listenerStatus != noErr {
  log("warn: 출력 장치 변경을 감시하지 못합니다 (OSStatus \(listenerStatus))")
}

let fillTimer = DispatchSource.makeTimerSource(queue: writeQueue)
fillTimer.schedule(deadline: .now() + FILL_TIMER_INTERVAL_SEC, repeating: FILL_TIMER_INTERVAL_SEC)
fillTimer.setEventHandler { clock.fillGap(beforeWriting: 0) }
fillTimer.resume()

func shutdown() -> Never {
  fillTimer.cancel()
  capture.stop()
  writeQueue.sync { clock.fillGap(beforeWriting: 0, isFinal: true) }
  exit(0)
}

signal(SIGTERM) { _ in shutdown() }
signal(SIGINT) { _ in shutdown() }

// 부모가 stdin을 닫으면(또는 죽으면) 같이 끝난다
DispatchQueue.global().async {
  while readLine() != nil {}
  shutdown()
}

log("ready")
RunLoop.main.run()
