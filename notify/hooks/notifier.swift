// Claude Notify: the notify mod's banners. A click brings you to the Ghostty tab that sent it, without pulling its
// window to your Space, which Ghostty's own notification click does for a background tab. Or to the Rex pane that sent
// it. Built by build-notifier.sh.
//   claude-notify post <title> <body> <target>   post one banner and exit; target: a Ghostty tty, or rex|<rex>|<session>|<block>
//   claude-notify icon <png>                  draw the app's icon (the build does)
//   (launched by macOS for a click)           focus the tab the banner names, then exit
import AppKit
import UserNotifications

// Focusing a background tab of a window on another Space pulls the window over; focusing its selected tab first
// slides to the window's Space instead, and the background tab is then selected in place.
let FOCUS = """
on run argv
  set target to item 1 of argv
  tell application "Ghostty"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in terminals of t
          if tty of s is target then
            -- s and w name it by position, and focusing a window reorders them: find it again by id.
            set sid to id of s
            if not (selected of t) then
              focus (focused terminal of selected tab of w)
              delay 0.5
            end if
            focus (first terminal whose id is sid)
            return
          end if
        end repeat
      end repeat
    end repeat
  end tell
end run
"""

/** Runs a command; a failure goes to ~/Library/Logs/Claude Notify.log, since a click has nowhere else to say why. */
func run(_ path: String, _ args: [String]) {
  let p = Process()
  let err = Pipe()
  p.executableURL = URL(fileURLWithPath: path)
  p.arguments = args
  p.standardError = err
  do { try p.run() } catch { return log("\(path): \(error.localizedDescription)") }
  p.waitUntilExit()
  if p.terminationStatus != 0 {
    log("\(path) \(args.last ?? ""): exit \(p.terminationStatus): \(String(decoding: err.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self))")
  }
}

/** A command's output, or nothing when it fails. */
func output(_ path: String, _ args: [String]) -> Data {
  let p = Process()
  let out = Pipe()
  p.executableURL = URL(fileURLWithPath: path)
  p.arguments = args
  p.standardOutput = out
  guard (try? p.run()) != nil else { return Data() }
  let data = out.fileHandleForReading.readDataToEndOfFile()
  p.waitUntilExit()
  return p.terminationStatus == 0 ? data : Data()
}

/**
 * Brings you to a Rex pane. `rex focus` only moves the server's focus: the Rex app keeps the tab it shows, so each Mac
 * app attached to the session is asked to show the pane's tab (session.select, which needs Remote Control).
 */
func showRex(_ rex: String, session: String, block: String) {
  run(rex, ["focus", "-s", session, block])
  let view = (try? JSONSerialization.jsonObject(with: output(rex, ["session", "inspect", session, "--json"]))) as? [String: Any]
  if let window = view?["active_window_id"] as? String {
    for client in view?["clients"] as? [[String: Any]] ?? [] {
      let info = client["info"] as? [String: Any]
      guard info?["kind"] as? String == "app", info?["platform"] as? String == "macos", let id = client["client_id"] as? String else { continue }
      run(rex, ["-C", id, "do", "session.select", "session_id=\(session)", "window_id=\(window)"])
    }
  } else {
    log("rex session inspect \(session): no active window")
  }
  run("/usr/bin/osascript", ["-e", "tell application \"Rex\" to activate"])
}

func log(_ line: String) {
  let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Claude Notify.log")
  let text = Data("\(Date()) \(line)\n".utf8)
  if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(text); try? h.close() } else { try? text.write(to: url) }
}

final class Delegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
  let center = UNUserNotificationCenter.current()

  func applicationWillFinishLaunching(_ note: Notification) {
    center.delegate = self // before launch ends, so a click that launched us is delivered here
  }

  func applicationDidFinishLaunching(_ note: Notification) {
    let args = Array(CommandLine.arguments.dropFirst())
    if args.first == "post", args.count == 4 {
      post(title: args[1], body: args[2], tty: args[3])
    } else {
      // Launched for a click: it arrives in didReceive. Nothing came: leave.
      DispatchQueue.main.asyncAfter(deadline: .now() + 10) { exit(0) }
    }
  }

  func post(title: String, body: String, tty: String) {
    center.requestAuthorization(options: [.alert, .sound]) { isAllowed, error in
      guard isAllowed else {
        FileHandle.standardError.write(Data("claude-notify: not allowed to notify \(error.map { "(\($0.localizedDescription))" } ?? "")\n".utf8))
        exit(2)
      }
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      content.sound = .default
      content.userInfo = ["tty": tty]
      self.center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)) { error in
        if let error { FileHandle.standardError.write(Data("claude-notify: \(error.localizedDescription)\n".utf8)) }
        exit(error == nil ? 0 : 1)
      }
    }
  }

  // A click (or the banner's default action).
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                              withCompletionHandler done: @escaping () -> Void) {
    if let target = response.notification.request.content.userInfo["tty"] as? String {
      let rex = target.split(separator: "|").map(String.init)
      if rex.count == 4, rex[0] == "rex" {
        showRex(rex[1], session: rex[2], block: rex[3])
      } else {
        run("/usr/bin/osascript", ["-e", FOCUS, target])
      }
    }
    done()
    exit(0)
  }

  // Show the banner even if this app happens to be running in front.
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                              withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
    done([.banner, .sound])
  }
}

// The build draws the app's icon with the binary itself: 🔔 on a clear 1024 px square.
if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "icon" {
  let side = 1024
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: side, pixelsHigh: side, bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let bell = NSAttributedString(string: "🔔", attributes: [.font: NSFont.systemFont(ofSize: CGFloat(side) * 0.78)])
  let size = bell.size()
  bell.draw(at: NSPoint(x: (CGFloat(side) - size.width) / 2, y: (CGFloat(side) - size.height) / 2))
  NSGraphicsContext.current = nil
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
  exit(0)
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
