import type { Accent } from './types.ts';

/**
 * Озвучка полностью офлайн — системный синтезатор речи Android (speechSynthesis в WebView).
 * Работает без сети, если в системе установлены голоса (Настройки → Язык → Синтез речи).
 */

export const hasSpeech = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function stopSpeaking(): void {
  if (hasSpeech()) window.speechSynthesis.cancel();
}

export const LOCALE: Record<Accent | 'ru', string> = {
  us: 'en-US',
  uk: 'en-GB',
  au: 'en-AU',
  other: 'en-US',
  ru: 'ru-RU',
};

function pickVoice(locale: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const want = locale.toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === want && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === want) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(want.slice(0, 2)))
  );
}

export function speak(text: string, locale: string): Promise<void> {
  if (!hasSpeech()) return Promise.reject(new Error('TTS unavailable'));
  stopSpeaking();
  return new Promise<void>((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    u.rate = 0.92;
    const voice = pickVoice(locale);
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = () => reject(new Error('TTS failed'));
    window.speechSynthesis.speak(u);
  });
}
