#!/usr/bin/env bash
# Сборка подписанного APK datalaw_lexa. Используется и локально (npm run android:release), и в GitHub Actions.
#
# Подпись — ПОСТОЯННАЯ (signing/datalaw_lexa.keystore лежит в репозитории, пароль публичный):
# все сборки подписаны одним ключом, поэтому Android ставит новую версию ПОВЕРХ старой,
# без удаления приложения и потери «Моих слов».
# Условие обновления: versionCode новой сборки больше, чем у установленной.
#   CI:        versionCode = номер запуска workflow (GITHUB_RUN_NUMBER)
#   локально:  задайте VERSION_CODE=<число больше уже установленного>
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
VERSION_CODE="${VERSION_CODE:-${GITHUB_RUN_NUMBER:-1}}"
KEYSTORE="${KEYSTORE:-signing/datalaw_lexa.keystore}"
KEY_ALIAS="${KEY_ALIAS:-datalaw_lexa}"
KEYSTORE_PASSWORD="${KEYSTORE_PASSWORD:-datalaw_lexa}"
KEY_PASSWORD="${KEY_PASSWORD:-$KEYSTORE_PASSWORD}"
OUT_DIR="${OUT_DIR:-release}"
OUT_APK="$OUT_DIR/datalaw_lexa-${VERSION}.apk"

echo "▶ datalaw_lexa ${VERSION} (versionCode ${VERSION_CODE})"

if [ ! -f public/data/meta.json ]; then
  echo "✖ Нет public/data/meta.json — сначала соберите словарь: npm run data:build (или npm run data:sample для проверки)" >&2
  exit 1
fi

[ -d android ] || npx cap add android

npm run assets
npm run build
npx cap sync android

# versionCode / versionName
GRADLE=android/app/build.gradle
sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/" "$GRADLE"
sed -i -E "s/versionName \"[^\"]*\"/versionName \"${VERSION}\"/" "$GRADLE"
grep -nE "versionCode|versionName|applicationId" "$GRADLE"

(cd android && ./gradlew --no-daemon assembleRelease)

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$SDK" ] || { echo "✖ Не задан ANDROID_HOME" >&2; exit 1; }
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"

UNSIGNED="$(ls android/app/build/outputs/apk/release/*.apk | head -1)"
mkdir -p "$OUT_DIR"
ALIGNED="$(mktemp -u).apk"
"$BT/zipalign" -p -f 4 "$UNSIGNED" "$ALIGNED"
"$BT/apksigner" sign \
  --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KEYSTORE_PASSWORD" --key-pass "pass:$KEY_PASSWORD" \
  --out "$OUT_APK" "$ALIGNED"
rm -f "$ALIGNED"

"$BT/apksigner" verify --print-certs "$OUT_APK" | grep -E "Signer #1 certificate (DN|SHA-256)"
echo "✔ $OUT_APK"
