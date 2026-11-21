// Claude Notify: the notify mod's banners. A click brings you to the Ghostty tab that sent it, without pulling its
// window to your Space, which Ghostty's own notification click does for a background tab. Or to the Rex pane that sent
// it. Built by build-notifier.sh.
//   claude-notify post <title> <body> <target>   post one banner and exit; target: a Ghostty tty, or rex|<rex>|<session>|<block>
//   claude-notify set-icon [<image or app>]      make it the app's icon and rebuild; without one, back to 🔔
//   claude-notify forget <app id>                remove an old Claude Notify ID from macOS (the build does, after set-icon)
//   claude-notify icon <png>                     draw 🔔 as the icon (the build does, when there is no icon.png)
//   (launched by macOS for a click)              focus the tab the banner names, then exit
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

// ─── Commands run from a shell ───────────────────────────────────────────────

/** The mod folder: this app is <mod>/.build/Claude Notify.app. */
let modRoot = Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent()

/** Runs a command quietly and returns its exit status. */
@discardableResult
func status(_ path: String, _ args: [String]) -> Int32 {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: path)
  p.arguments = args
  p.standardOutput = FileHandle.nullDevice
  p.standardError = FileHandle.nullDevice
  guard (try? p.run()) != nil else { return -1 }
  p.waitUntilExit()
  return p.terminationStatus
}

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("claude-notify: \(message)\n".utf8))
  exit(2)
}

/** Draws `image`, or 🔔 without one, on a clear 1024 px square, as a PNG at `path`. */
func drawIcon(_ image: NSImage?, to path: String) {
  let side = CGFloat(1024)
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(side), pixelsHigh: Int(side), bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  if let image {
    image.draw(in: NSRect(x: 0, y: 0, width: side, height: side))
  } else {
    let bell = NSAttributedString(string: "🔔", attributes: [.font: NSFont.systemFont(ofSize: side * 0.78)])
    let size = bell.size()
    bell.draw(at: NSPoint(x: (side - size.width) / 2, y: (side - size.height) / 2))
  }
  NSGraphicsContext.current = nil
  do { try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path)) } catch { fail("\(path): \(error.localizedDescription)") }
}

/**
 * Makes `path` (an image, or an app for its own icon at full size) the icon, as <mod>/icon.png, and rebuilds. The new
 * icon gives the app a new ID: see build-notifier.sh.
 */
func setIcon(_ path: String?) -> Int32 {
  let icon = modRoot.appendingPathComponent("icon.png").path
  if let path {
    let image = path.hasSuffix(".app") ? NSWorkspace.shared.icon(forFile: path) : NSImage(contentsOfFile: path)
    guard let image, image.isValid, FileManager.default.fileExists(atPath: path) else { fail("\(path) is not an image or an app") }
    drawIcon(image, to: icon)
  } else {
    try? FileManager.default.removeItem(atPath: icon)
  }
  let p = Process()
  p.executableURL = URL(fileURLWithPath: "/bin/sh")
  p.arguments = [modRoot.appendingPathComponent("hooks/build-notifier.sh").path, modRoot.path]
  do { try p.run() } catch { fail("build: \(error.localizedDescription)") }
  p.waitUntilExit()
  return p.terminationStatus
}

/**
 * Removes a Claude Notify ID from macOS, so System Settings → Notifications no longer lists it. macOS keeps the list in
 * usernoted's settings file and rebuilds usernoted's database rows from it, so both change. usernoted writes its memory
 * back when it stops, so it is frozen meanwhile, then killed (launchd restarts it). Both files are backed up first.
 */
func forget(_ id: String) -> Int32 {
  guard id.hasPrefix("com.whilestevego.claude-notify"), id.allSatisfy({ $0.isLetter || $0.isNumber || ".-".contains($0) }) else {
    fail("forget only takes a Claude Notify ID (com.whilestevego.claude-notify…)")
  }
  let files = FileManager.default
  let group = files.homeDirectoryForCurrentUser.appendingPathComponent("Library/Group Containers/group.com.apple.usernoted")
  let prefs = group.appendingPathComponent("Library/Preferences/group.com.apple.usernoted.plist")
  let db = group.appendingPathComponent("db2/db").path
  let backup = files.temporaryDirectory.appendingPathComponent("claude-notify-forget.\(getpid())")
  do {
    try files.createDirectory(at: backup, withIntermediateDirectories: true)
    try files.copyItem(at: prefs, to: backup.appendingPathComponent(prefs.lastPathComponent))
  } catch { fail("backup: \(error.localizedDescription)") }
  guard status("/usr/bin/sqlite3", ["-readonly", db, ".backup '\(backup.appendingPathComponent("db").path)'"]) == 0 else { fail("backup of \(db) failed") }

  // Permissions (control of Ghostty and Rex): tccutil only knows an ID while an app with it is registered.
  status("/usr/bin/tccutil", ["reset", "All", id])

  status("/usr/bin/killall", ["-STOP", "usernoted"])
  defer { status("/usr/bin/killall", ["-CONT", "usernoted"]) }
  guard let data = try? Data(contentsOf: prefs),
        var settings = (try? PropertyListSerialization.propertyList(from: data, format: nil)) as? [String: Any] else { fail("can't read \(prefs.path)") }
  settings["apps"] = (settings["apps"] as? [[String: Any]] ?? []).filter { $0["bundle-id"] as? String != id }
  do {
    try PropertyListSerialization.data(fromPropertyList: settings, format: .binary, options: 0).write(to: prefs)
  } catch { fail("can't write \(prefs.path): \(error.localizedDescription)") }
  let rows = "select app_id from app where identifier = '\(id)'"
  let sql = "pragma busy_timeout = 3000; begin;" + ["record", "categories", "delivered", "displayed", "requests", "snoozed"]
    .map { " delete from \($0) where app_id in (\(rows));" }.joined() + " delete from app where identifier = '\(id)'; commit;"
  guard status("/usr/bin/sqlite3", [db, sql]) == 0 else { fail("can't change \(db); backups in \(backup.path)") }
  status("/usr/bin/killall", ["cfprefsd"])
  status("/usr/bin/killall", ["-KILL", "usernoted"])
  status("/usr/bin/killall", ["NotificationCenter"])
  print("Forgot \(id). Backups: \(backup.path)")
  return 0
}

let args = Array(CommandLine.arguments.dropFirst())
switch (args.first, args.count) {
case ("icon", 2): drawIcon(nil, to: args[1]); exit(0)
case ("set-icon", 1), ("set-icon", 2): exit(setIcon(args.count == 2 ? args[1] : nil))
case ("forget", 2): exit(forget(args[1]))
default: break
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
