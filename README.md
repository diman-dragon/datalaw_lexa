# datalaw_lexa — англо-русский словарь для Android (Kotlin)

Нативное приложение: **Kotlin · Jetpack Compose · Material 3**. Версия **0.1.4** (прежняя веб-версия на Capacitor/Preact заменена; данные, подпись и `applicationId` те же, поэтому ставится поверх).

Словарь работает онлайн (файлы читаются «на лету» и кэшируются), а после загрузки в настройках — полностью офлайн.

> Oxford и Cambridge — проприетарные, встроить их нельзя. Данные собираются из открытых источников.

## Сборка

JDK 17, Android SDK (compileSdk 35), Gradle 8.11+.

```bash
gradle wrapper --gradle-version 8.11.1      # один раз: создаёт ./gradlew
./gradlew :app:testDebugUnitTest            # юнит-тесты (Kotlin)
python3 scripts/test_build_data.py          # тесты сборщика данных (Python)
./gradlew :app:assembleDebug                # app/build/outputs/apk/debug/
VERSION_CODE=2000 ./gradlew :app:assembleRelease
```

APK подписывается постоянным ключом из `signing/` (alias и пароль — `datalaw_lexa`, ключ публичный; не пересоздавайте его — иначе обновление поверх станет невозможным). Установка поверх требует, чтобы `versionCode` был больше установленного: в CI он равен номеру запуска workflow, локально задайте `VERSION_CODE=…` (если ставите поверх старой веб-версии, возьмите значение больше её номера запуска CI). Адрес словаря — `DATA_URL` (переменная окружения или `-PDATA_URL=…`).

Версия — `version.properties`; `python3 scripts/bump_version.py` поднимает её на 1.

## Данные

`scripts/build_data.py` (Python, запускается только в CI) собирает словарь и кладёт его в `public/data` — шардированный JSON; workflow публикует его в ветку `dictionary`, а приложение читает файлы с `https://raw.githubusercontent.com/<owner>/<repo>/dictionary/`. Репозиторий должен быть **публичным**.

| Что | Источник | Лицензия |
| --- | --- | --- |
| Значения, части речи, IPA, примеры, синонимы, этимология, **переводы на русский** | Викисловарь через [kaikki.org](https://kaikki.org) | CC BY-SA |
| Частотность, отбор слов | [wordfreq](https://pypi.org/project/wordfreq/) | CC BY-SA |
| Предложения EN↔RU | [Tatoeba](https://tatoeba.org) | CC BY 2.0 FR |

```bash
python3 scripts/build_data.py --sample     # образец из 10 слов
python3 scripts/build_data.py --download --require-wordfreq   # полная сборка (~3 ГБ, 15–40 мин)
```

Хэш шардов (FNV-1a) реализован и в Python, и в Kotlin (`core/Hash.kt`); юнит-тест сверяет значения со сборщиком.

## Устройство кода (`app/src/main/kotlin/app/datalaw/lexa`)

| Пакет | Что внутри |
| --- | --- |
| `core` | модели, разбор JSON, нормализация, поиск (префикс + опечатки), хэш шардов |
| `data` | файловое хранилище (пакет/кэш), сеть, `Dictionary`, загрузка офлайн-пакета |
| `store` | настройки, «Мои слова», история (SharedPreferences; перенос из веб-версии) |
| `platform` | озвучка (`TextToSpeech`), голосовой ввод (`SpeechRecognizer`), «поделиться» |
| `ui` | тема, навигация, компоненты, экраны; строки — `ui/i18n/Str.kt` (RU/EN) |

## Что изменилось по сравнению с веб-версией

- Нет свайпа между вкладками нижней панели (переключение — нажатием); системная «Назад» работает как раньше.
- Сборщик словаря остался на Python: он нужен только CI, а `wordfreq` — Python-библиотека без аналога на JVM.

## Лицензии и приватность

Данные Викисловаря и wordfreq — CC BY-SA 4.0, Tatoeba — CC BY 2.0 FR. Из сети загружаются только файлы словаря; история и «Мои слова» остаются на устройстве. Голосовой ввод распознаёт системная служба Android.

© 2026 DataLaw DesignLab
