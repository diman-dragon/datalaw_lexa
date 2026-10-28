#!/usr/bin/env node
// Донастройка сгенерированного проекта android/ (идемпотентно, запускается после `cap add` / `cap sync`):
//   - нативные плагины LexaSpeech (озвучка) и LexaVoice (голосовой ввод) + MainActivity, который их регистрирует
//   - <queries> для TTS и для службы распознавания речи: без них Android 11+ скрывает эти службы
//   - разрешение RECORD_AUDIO (микрофон для голосового ввода)
//   - allowBackup=false, портретная ориентация
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "android", "app");
const log = (...a) => console.log("[android-patch]", ...a);
if (!fs.existsSync(appDir)) {
  console.error("android/ не найден — сначала `npx cap add android`.");
  process.exit(1);
}

const cfgSrc = fs.readFileSync(path.join(root, "capacitor.config.ts"), "utf8");
const PKG = /appId:\s*['"]([^'"]+)['"]/.exec(cfgSrc)?.[1];
if (!PKG) {
  console.error("Не нашёл appId в capacitor.config.ts");
  process.exit(1);
}

// 1. Java
const javaDir = path.join(appDir, "src", "main", "java", ...PKG.split("."));
fs.mkdirSync(javaDir, { recursive: true });
for (const f of ["MainActivity", "LexaSpeechPlugin", "LexaVoicePlugin"]) {
  const src = fs.readFileSync(path.join(root, "scripts", "android", `${f}.java`), "utf8").replaceAll("__PKG__", PKG);
  fs.writeFileSync(path.join(javaDir, `${f}.java`), src);
}
log("нативные классы установлены в", path.relative(root, javaDir));

// 2. Манифест
const mp = path.join(appDir, "src", "main", "AndroidManifest.xml");
let m = fs.readFileSync(mp, "utf8");
// <queries>: добавляем каждое действие по отдельности (идемпотентно, в т.ч. для уже пропатченного манифеста)
function ensureQuery(action) {
  if (m.includes(action)) return;
  const intent = `        <intent>
            <action android:name="${action}" />
        </intent>
`;
  if (m.includes("</queries>")) {
    m = m.replace(/[ \t]*<\/queries>/, `${intent}    </queries>`);
  } else {
    m = m.replace("<application", `<queries>
${intent}    </queries>

    <application`);
  }
}
ensureQuery("android.intent.action.TTS_SERVICE");
ensureQuery("android.speech.RecognitionService");

if (!m.includes("android.permission.RECORD_AUDIO")) {
  m = m.replace("<application", `<uses-permission android:name="android.permission.RECORD_AUDIO" />

    <application`);
}
m = m.replace('android:allowBackup="true"', 'android:allowBackup="false"');
if (!m.includes("android:screenOrientation")) {
  m = m.replace("<activity", '<activity\n            android:screenOrientation="portrait"');
}
fs.writeFileSync(mp, m);
for (const needle of ["TTS_SERVICE", "android.speech.RecognitionService", "RECORD_AUDIO"]) {
  if (!m.includes(needle)) {
    console.error(`Не удалось добавить в манифест: ${needle}`);
    process.exit(1);
  }
}
log("манифест: <queries> TTS и распознавание речи, RECORD_AUDIO, allowBackup=false, portrait");
