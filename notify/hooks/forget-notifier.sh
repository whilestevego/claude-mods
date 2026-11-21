#!/bin/sh
# forget-notifier.sh <app id>: removes a Claude Notify app ID from macOS, so System Settings → Notifications no longer
# lists it. Only Claude Notify's own IDs (com.whilestevego.claude-notify…) are accepted.
#
# macOS keeps the list in usernoted's settings file, and rebuilds usernoted's database rows from it, so both are edited.
# usernoted writes its memory back when it stops, so it is frozen while they change, then killed (launchd restarts it).
# Backups of both go to $TMPDIR/forget-notifier.<pid>.
set -e
id="$1"
case "$id" in
  com.whilestevego.claude-notify*) ;;
  *) echo "usage: forget-notifier.sh com.whilestevego.claude-notify[...]" >&2; exit 2 ;;
esac
group="$HOME/Library/Group Containers/group.com.apple.usernoted"
prefs="$group/Library/Preferences/group.com.apple.usernoted.plist"
db="$group/db2/db"
backup="${TMPDIR:-/tmp/}"; backup="${backup%/}/forget-notifier.$$"
mkdir -p "$backup"
cp "$prefs" "$backup/"
sqlite3 -readonly "$db" ".backup '$backup/db'"

# Permissions (control of Ghostty and Rex): tccutil only knows an ID while an app with it is registered.
tccutil reset All "$id" >/dev/null 2>&1 || true

killall -STOP usernoted 2>/dev/null || true
trap 'killall -CONT usernoted 2>/dev/null || true' EXIT
python3 - "$prefs" "$id" <<'EOF'
import plistlib, sys
path, gone = sys.argv[1], sys.argv[2]
with open(path, 'rb') as f:
    d = plistlib.load(f)
d['apps'] = [a for a in d.get('apps', []) if a.get('bundle-id') != gone]
with open(path, 'wb') as f:
    plistlib.dump(d, f, fmt=plistlib.FMT_BINARY)
EOF
q="select app_id from app where identifier = '$id'"
sqlite3 "$db" "pragma busy_timeout = 3000; begin;
  delete from record where app_id in ($q); delete from categories where app_id in ($q);
  delete from delivered where app_id in ($q); delete from displayed where app_id in ($q);
  delete from requests where app_id in ($q); delete from snoozed where app_id in ($q);
  delete from app where identifier = '$id'; commit;" >/dev/null
killall cfprefsd 2>/dev/null || true
killall -KILL usernoted 2>/dev/null || true
killall NotificationCenter 2>/dev/null || true
echo "Forgot $id. Backups: $backup"
