#!/usr/bin/env bash
# Runs inside a booted emulator. The app's first screen and document picker must
# work with the network disabled, without crashing or needing browser services.
set -euo pipefail
: "${APK_PATH:?Set APK_PATH to the debug APK}"
package=com.zynq.stereosound
ui_dump="${RUNNER_TEMP:-/tmp}/stereo-ui.xml"

report_failure() {
  local failed_command="${1:-unknown}" failed_line="${2:-unknown}"
  echo "::error title=Smoke test command::line $failed_line: ${failed_command//%/%25}"
  # Mirror a short runtime diagnosis into check annotations. This also makes
  # headless CI failures understandable without downloading the full log.
  local runtime
  runtime=$(adb logcat -d -s AndroidRuntime:E | tail -n 35 || true)
  if [[ -n "$runtime" ]]; then
    runtime=${runtime//%/%25}; runtime=${runtime//$'\n'/%0A}; runtime=${runtime//$'\r'/%0D}
    echo "::error title=Android runtime::$runtime"
  fi
  local activities
  activities=$(adb shell dumpsys activity activities | grep -i -E 'resumed|topResumed|documentsui' | head -n 8 || true)
  if [[ -n "$activities" ]]; then
    activities=${activities//%/%25}; activities=${activities//$'\n'/%0A}; activities=${activities//$'\r'/%0D}
    echo "::notice title=Android foreground activity::$activities"
  fi
  adb exec-out screencap -p > "${RUNNER_TEMP:-/tmp}/stereo-smoke.png" || true
  # Temporarily mirror a failure screenshot into check annotations for diagnosis.
  if [[ -s "${RUNNER_TEMP:-/tmp}/stereo-smoke.png" ]]; then
    local i=0
    while IFS= read -r part; do
      i=$((i+1)); echo "::notice title=screen-part-$i::$part"
    done < <(base64 -w0 "${RUNNER_TEMP:-/tmp}/stereo-smoke.png" | fold -w 12000 | head -n 10)
  fi
}
trap 'report_failure "$BASH_COMMAND" "$LINENO"' ERR

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
