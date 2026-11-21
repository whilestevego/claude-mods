#!/bin/sh
# build-notifier.sh <mod folder>: builds notifier.swift into <mod folder>/.build/Claude Notify.app, signed ad hoc and
# registered with LaunchServices (macOS only lets an app bundle post banners). Its icon is <mod folder>/icon.png, or 🔔
# without one (set-notifier-icon.sh sets it). Skipped while the build is current. Built in a folder of its own and moved
# into place, so sessions starting together don't run a half-built app. Prints the app's ID.
#
# macOS caches a banner's icon by app ID, and no restart clears it, so the ID carries a hash of the icon: a new icon is a
# new app to macOS. The old ID is then removed from macOS (forget-notifier.sh), and banners need permission once more.
set -e
src="$1/hooks/notifier.swift" app="$1/.build/Claude Notify.app"
bin="$app/Contents/MacOS/claude-notify"
icon="$1/icon.png"
id=com.whilestevego.claude-notify
[ -f "$icon" ] && id="$id.$(shasum -a 256 "$icon" | cut -c1-8)"
built=$(/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" "$app/Contents/Info.plist" 2>/dev/null || true)
[ "$built" = "$id" ] && [ "$bin" -nt "$src" ] && [ "$bin" -nt "$0" ] && { echo "$id"; exit 0; }
lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
# A killed build leaves its folder behind, and macOS can launch that stale copy for a banner click.
for old in "$1"/.build/tmp.*; do
  [ -d "$old" ] && ! kill -0 "${old##*.}" 2>/dev/null && { "$lsregister" -u "$old/Claude Notify.app" 2>/dev/null; rm -rf "$old"; }
done
tmp="$1/.build/tmp.$$"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/Claude Notify.app/Contents/MacOS" "$tmp/Claude Notify.app/Contents/Resources" "$tmp/AppIcon.iconset"
cat > "$tmp/Claude Notify.app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>$id</string>
  <key>CFBundleName</key><string>Claude Notify</string>
  <key>CFBundleExecutable</key><string>claude-notify</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSUIElement</key><true/>
  <key>NSAppleEventsUsageDescription</key><string>A click on a Claude Notify banner brings you to the terminal tab that sent it.</string>
</dict></plist>
PLIST
swiftc -O "$src" -o "$tmp/Claude Notify.app/Contents/MacOS/claude-notify"
if [ -f "$icon" ]; then cp "$icon" "$tmp/bell.png"; else "$tmp/Claude Notify.app/Contents/MacOS/claude-notify" icon "$tmp/bell.png"; fi
for n in 16 32 128 256 512; do
  sips -z $n $n "$tmp/bell.png" --out "$tmp/AppIcon.iconset/icon_${n}x${n}.png" >/dev/null
  sips -z $((n * 2)) $((n * 2)) "$tmp/bell.png" --out "$tmp/AppIcon.iconset/icon_${n}x${n}@2x.png" >/dev/null
done
iconutil -c icns "$tmp/AppIcon.iconset" -o "$tmp/Claude Notify.app/Contents/Resources/AppIcon.icns"
codesign --force --sign - "$tmp/Claude Notify.app" 2>/dev/null
# Forgotten while the old app is still registered, so its permissions can be reset too.
[ -n "$built" ] && [ "$built" != "$id" ] && sh "$1/hooks/forget-notifier.sh" "$built" >&2
rm -rf "$app"
mv "$tmp/Claude Notify.app" "$app"
"$lsregister" -f "$app"
echo "$id"
