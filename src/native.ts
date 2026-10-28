import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { setNativeSpeech } from './lib/speech.ts';
import { setNativeVoice } from './lib/voice.ts';
import { navigate, parseHash, tabOf } from './router.ts';
import type { NativeSpeech } from './lib/speech.ts';
import type { NativeVoice } from './lib/voice.ts';
import { settings } from './store.ts';

export const isNative = Capacitor.isNativePlatform();

/** Окна поверх экрана (голосовой ввод) перехватывают системную «Назад»: закрывают себя, а не уходят с экрана. */
const backHandlers: Array<() => void> = [];
export function pushBackHandler(fn: () => void): () => void {
  backHandlers.push(fn);
  return () => {
    const i = backHandlers.lastIndexOf(fn);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

/** Системная кнопка «Назад» Android: шаг назад по маршрутам, на главной — выход. */
export function initNative(): void {
  if (!isNative) return;
  // нативный синтезатор речи (scripts/android/LexaSpeechPlugin.java)
  setNativeSpeech(registerPlugin<NativeSpeech>('LexaSpeech'));
  // нативное распознавание речи (scripts/android/LexaVoicePlugin.java)
  setNativeVoice(registerPlugin<NativeVoice>('LexaVoice'));
  void CapApp.addListener('backButton', () => {
    const top = backHandlers[backHandlers.length - 1];
    if (top) {
      top();
      return;
    }
    const route = parseHash(location.hash);
    if (route.name === 'home') {
      void CapApp.exitApp(); // «Поиск» — корень: назад закрывает приложение
    } else if (tabOf(route) !== null) {
      navigate({ name: 'home' }, true); // другая вкладка → на главную
    } else {
      // слово / обратный поиск → на предыдущий экран; если истории нет — на главную
      const before = location.hash;
      history.back();
      setTimeout(() => {
        if (location.hash === before) navigate({ name: 'home' }, true);
      }, 160);
    }
  });
}

export function hideSplash(): void {
  if (!isNative) return;
  void SplashScreen.hide({ fadeOutDuration: 180 }).catch(() => undefined);
}

export function syncStatusBar(dark: boolean): void {
  if (!isNative) return;
  // Style.Dark = светлые иконки (для тёмного фона)
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
}

export function tap(style: 'light' | 'medium' = 'light'): void {
  if (!isNative || !settings.get().haptics) return;
  void Haptics.impact({ style: style === 'light' ? ImpactStyle.Light : ImpactStyle.Medium }).catch(
    () => undefined,
  );
}

/** Поделиться текстом: системное меню на Android, Web Share или буфер обмена в браузере. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied'> {
  if (isNative) {
    await Share.share({ title, text, dialogTitle: title });
    return 'shared';
  }
  if (typeof navigator.share === 'function') {
    await navigator.share({ title, text });
    return 'shared';
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
