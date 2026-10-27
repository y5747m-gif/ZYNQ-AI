#!/usr/bin/env bash
# Runs inside a booted emulator. The app's first screen and document picker must
# work with the network disabled, without crashing or needing browser services.
set -euo pipefail
: "${APK_PATH:?Set APK_PATH to the debug APK}"
package=com.zynq.stereosound
ui_dump="${RUNNER_TEMP:-/tmp}/stereo-ui.xml"

report_failure() {
  echo '::error::Android smoke test failed. Recent Android runtime errors follow.'
  adb logcat -d -s AndroidRuntime:E ActivityManager:E | tail -n 80 || true
  adb exec-out screencap -p > "${RUNNER_TEMP:-/tmp}/stereo-smoke.png" || true
}
trap report_failure ERR

adb install -r "$APK_PATH"
adb shell svc wifi disable || true
adb shell svc data disable || true
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard || true
adb shell am start -W -n "$package/.MainActivity"
adb shell pidof "$package" >/dev/null
adb shell uiautomator dump /sdcard/stereo-ui.xml >/dev/null
adb exec-out cat /sdcard/stereo-ui.xml > "$ui_dump"

# Locate the actual native button rather than relying on pixel coordinates.
coords=$(python3 - "$ui_dump" "$package" <<'PY'
import re, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
pkg = sys.argv[2]
nodes = {n.get('resource-id'): n for n in root.iter('node')}
button = nodes.get(pkg + ':id/pickButton')
status = nodes.get(pkg + ':id/statusText')
if button is None or status is None:
    raise SystemExit('Native player controls did not appear after launch')
if button.get('enabled') != 'true' or not status.get('text'):
    raise SystemExit('Initial player state is not ready')
bounds = list(map(int, re.findall(r'\d+', button.get('bounds', ''))))
if len(bounds) != 4:
    raise SystemExit('File picker button has invalid bounds')
print((bounds[0]+bounds[2])//2, (bounds[1]+bounds[3])//2)
PY
)
adb exec-out screencap -p > "${RUNNER_TEMP:-/tmp}/stereo-smoke.png"
adb shell input tap $coords
# The native document picker is a different activity, not a website.
adb shell dumpsys activity activities | grep -i -E 'documentsui|documents\.ui|documentpicker' >/dev/null
adb shell input keyevent KEYCODE_BACK
adb shell pidof "$package" >/dev/null
echo 'Offline launch and Android document picker passed.'
