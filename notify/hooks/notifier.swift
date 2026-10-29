// Claude Notify: the notify mod's banners. A click brings you to the Ghostty tab that sent it, without pulling its
// window to your Space, which Ghostty's own notification click does for a background tab. Built by build-notifier.sh.
//   claude-notify post <title> <body> <tty>   post one banner and exit
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
            if not (selected of t) then
              focus (focused terminal of selected tab of w)
              delay 0.5
            end if
            focus s
            return
          end if
        end repeat
      end repeat
    end repeat
  end tell
end run
"""

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
    if let tty = response.notification.request.content.userInfo["tty"] as? String {
      let osa = Process()
      osa.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
      osa.arguments = ["-e", FOCUS, tty]
      try? osa.run()
      osa.waitUntilExit()
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
