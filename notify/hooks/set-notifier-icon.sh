#!/bin/sh
# set-notifier-icon.sh <mod folder> <image>: makes <image> Claude Notify's icon and rebuilds the app. <image> is a .png,
# an .icns, or an .app (its own icon). Without <image> it goes back to 🔔. The new icon gives the app a new ID (see
# build-notifier.sh), so macOS asks once more for permission to show banners and to control the terminal.
set -e
root="$1" image="$2" icon="$1/icon.png"
if [ -z "$image" ]; then
  rm -f "$icon"
else
  if [ -d "$image" ]; then
    name=$(/usr/libexec/PlistBuddy -c "Print CFBundleIconFile" "$image/Contents/Info.plist")
    image="$image/Contents/Resources/${name%.icns}.icns"
  fi
  sips -s format png "$image" --out "$icon" >/dev/null
fi
sh "$root/hooks/build-notifier.sh" "$root"
