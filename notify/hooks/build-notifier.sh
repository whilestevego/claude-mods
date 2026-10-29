#!/bin/sh
# build-notifier.sh <mod folder>: builds notifier.swift into <mod folder>/.build/Claude Notify.app, signed ad hoc and
# registered with LaunchServices (macOS only lets an app bundle post banners). Skipped while the build is current. Built
# in a folder of its own and moved into place, so sessions starting together don't run a half-built app.
set -e
src="$1/hooks/notifier.swift" app="$1/.build/Claude Notify.app"
bin="$app/Contents/MacOS/claude-notify"
[ "$bin" -nt "$src" ] && [ "$bin" -nt "$0" ] && exit 0
tmp="$1/.build/tmp.$$"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/Claude Notify.app/Contents/MacOS" "$tmp/Claude Notify.app/Contents/Resources" "$tmp/AppIcon.iconset"
cat > "$tmp/Claude Notify.app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.whilestevego.claude-notify.app</string>
  <key>CFBundleName</key><string>Claude Notify</string>
  <key>CFBundleExecutable</key><string>claude-notify</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSUIElement</key><true/>
  <key>NSAppleEventsUsageDescription</key><string>A click on a Claude Notify banner brings you to the Ghostty tab that sent it.</string>
</dict></plist>
PLIST
swiftc -O "$src" -o "$tmp/Claude Notify.app/Contents/MacOS/claude-notify"
"$tmp/Claude Notify.app/Contents/MacOS/claude-notify" icon "$tmp/bell.png"
for n in 16 32 128 256 512; do
  sips -z $n $n "$tmp/bell.png" --out "$tmp/AppIcon.iconset/icon_${n}x${n}.png" >/dev/null
  sips -z $((n * 2)) $((n * 2)) "$tmp/bell.png" --out "$tmp/AppIcon.iconset/icon_${n}x${n}@2x.png" >/dev/null
done
iconutil -c icns "$tmp/AppIcon.iconset" -o "$tmp/Claude Notify.app/Contents/Resources/AppIcon.icns"
codesign --force --sign - "$tmp/Claude Notify.app"
rm -rf "$app"
mv "$tmp/Claude Notify.app" "$app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app"
