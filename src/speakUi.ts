import { t } from './i18n.ts';
import { SpeechError, speak } from './lib/speech.ts';
import { showToast } from './store.ts';

/** Озвучивает текст; ошибки показывает понятным сообщением (а не «синтез не установлен» на любой сбой). */
export async function say(text: string, locale: string): Promise<void> {
  try {
    await speak(text, locale);
  } catch (e) {
    const kind = e instanceof SpeechError ? e.kind : 'failed';
    showToast(t(kind === 'lang' ? 'toastNoVoice' : kind === 'engine' ? 'toastNoEngine' : 'toastSpeechFailed'));
  }
}
