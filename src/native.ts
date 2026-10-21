import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { setNativeSpeech } from './lib/speech.ts';
import type { NativeSpeech } from './lib/speech.ts';
import { settings } from './store.ts';

export const isNative = Capacitor.isNativePlatform();

/** Системная кнопка «Назад» Android: шаг назад по маршрутам, на главной — выход. */
export function initNative(): void {
  if (!isNative) return;
  // нативный синтезатор речи (scripts/android/LexaSpeechPlugin.java)
  setNativeSpeech(registerPlugin<NativeSpeech>('LexaSpeech'));
  void CapApp.addListener('backButton', () => {
    const atRoot = location.hash === '' || location.hash === '#/' || location.hash === '#';
    if (atRoot) void CapApp.exitApp();
    else history.back();
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
