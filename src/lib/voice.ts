import { normalizeEn, normalizeRu } from './text.ts';

/**
 * Голосовой ввод слов (распознавание речи).
 * Два пути:
 *   1) нативный плагин LexaVoice (android.speech.SpeechRecognizer) — основной в приложении;
 *   2) Web Speech API (SpeechRecognition) — для браузера (Chrome/Edge/Safari) и dev-режима.
 * Модуль не зависит от Capacitor: нативная реализация подключается через setNativeVoice().
 */

export type VoiceLang = 'en' | 'ru';

/**
 * permission  — нет доступа к микрофону;
 * unavailable — в системе нет службы распознавания речи / нет микрофона;
 * network     — службе нужна сеть (нет офлайн-пакета языка);
 * no-speech   — ничего не услышали / не разобрали;
 * lang        — язык не поддерживается службой;
 * busy        — служба занята другим запросом;
 * failed      — прочий сбой.
 */
export type VoiceErrorKind = 'permission' | 'unavailable' | 'network' | 'no-speech' | 'lang' | 'busy' | 'failed';

export class VoiceError extends Error {
  readonly kind: VoiceErrorKind;
  constructor(kind: VoiceErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'VoiceError';
    this.kind = kind;
  }
}

export type VoicePhase = 'listening' | 'processing';

export interface VoiceHandlers {
  onPhase?: (phase: VoicePhase) => void;
  /** Громкость голоса 0…1 (для анимации) */
  onLevel?: (level: number) => void;
  /** Промежуточный результат — слово появляется по мере произнесения */
  onPartial?: (text: string) => void;
  /** Итог: варианты распознавания, лучший — первый */
  onFinal: (alternatives: string[]) => void;
  onError: (error: VoiceError) => void;
}

export interface VoiceSession {
  /** Закончить запись и выдать результат */
  stop(): void;
  /** Прервать без результата */
  cancel(): void;
}

export interface NativeVoiceHandle {
  remove(): Promise<void>;
}

export interface NativeVoice {
  available(): Promise<{ value: boolean }>;
  start(options: { lang: string; preferOffline: boolean }): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  addListener(event: string, listener: (data: Record<string, unknown>) => void): Promise<NativeVoiceHandle>;
}

let native: NativeVoice | null = null;
export const setNativeVoice = (impl: NativeVoice | null): void => {
  native = impl;
};

/* ───────────── Web Speech API (минимальные собственные типы) ───────────── */

interface WebAlt {
  transcript: string;
}
interface WebResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: WebAlt | undefined;
}
interface WebEvent {
  results: { readonly length: number; [index: number]: WebResult | undefined };
}
interface WebRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((e: WebEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type WebCtor = new () => WebRecognition;

const webCtor = (): WebCtor | undefined => {
  const g = globalThis as { SpeechRecognition?: WebCtor; webkitSpeechRecognition?: WebCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition;
};

/** Есть ли вообще способ распознавать речь (нативный плагин или Web Speech). */
export const hasVoice = (): boolean => native !== null || webCtor() !== undefined;

/** Точная проверка: доступна ли служба распознавания в системе (async). */
export async function voiceAvailable(): Promise<boolean> {
  if (native) {
    try {
      return (await native.available()).value;
    } catch {
      return false;
    }
  }
  return webCtor() !== undefined;
}

/** Локаль распознавания по языку и выбранному акценту. */
export const voiceLocale = (lang: VoiceLang, accent: 'us' | 'uk' = 'us'): string =>
  lang === 'ru' ? 'ru-RU' : accent === 'uk' ? 'en-GB' : 'en-US';

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

const toStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

const NATIVE_CODES: Record<string, VoiceErrorKind> = {
  PERMISSION: 'permission',
  UNAVAILABLE: 'unavailable',
  UNIMPLEMENTED: 'unavailable', // плагин не зарегистрирован в MainActivity
  NETWORK: 'network',
  NO_SPEECH: 'no-speech',
  LANG: 'lang',
  BUSY: 'busy',
};

const WEB_CODES: Record<string, VoiceErrorKind> = {
  'not-allowed': 'permission',
  'service-not-allowed': 'permission',
  'audio-capture': 'unavailable',
  network: 'network',
  'no-speech': 'no-speech',
  'language-not-supported': 'lang',
};

function asVoiceError(e: unknown, table: Record<string, VoiceErrorKind> = NATIVE_CODES): VoiceError {
  if (e instanceof VoiceError) return e;
  const o = e as { code?: string; error?: string; message?: string } | null;
  const code = o?.code ?? o?.error ?? '';
  return new VoiceError(table[code] ?? 'failed', o?.message);
}

/* ───────────── Нативный путь ───────────── */

async function startNative(n: NativeVoice, lang: string, h: VoiceHandlers): Promise<VoiceSession> {
  let done = false;
  const handles: NativeVoiceHandle[] = [];

  const cleanup = () => {
    done = true;
    for (const handle of handles.splice(0)) void handle.remove().catch(() => undefined);
  };
  const fail = (e: VoiceError) => {
    if (done) return;
    cleanup();
    h.onError(e);
  };
  const on = async (event: string, cb: (d: Record<string, unknown>) => void) => {
    handles.push(await n.addListener(event, cb));
  };

  try {
    await on('state', (d) => {
      if (!done && (d['phase'] === 'listening' || d['phase'] === 'processing')) h.onPhase?.(d['phase']);
    });
    await on('level', (d) => {
      if (!done) h.onLevel?.(clamp01(Number(d['value'])));
    });
    await on('partial', (d) => {
      const text = typeof d['text'] === 'string' ? d['text'].trim() : '';
      if (!done && text) h.onPartial?.(text);
    });
    await on('final', (d) => {
      if (done) return;
      const alts = toStrings(d['alternatives']);
      cleanup();
      if (alts.length > 0) h.onFinal(alts);
      else h.onError(new VoiceError('no-speech'));
    });
    await on('error', (d) => {
      const o: { code?: string; message?: string } = {};
      if (typeof d['code'] === 'string') o.code = d['code'];
      if (typeof d['message'] === 'string') o.message = d['message'];
      fail(asVoiceError(o));
    });
    await n.start({ lang, preferOffline: true });
  } catch (e) {
    fail(asVoiceError(e));
  }

  return {
    stop() {
      if (!done) void n.stop().catch(() => undefined);
    },
    cancel() {
      if (done) return;
      cleanup();
      void n.cancel().catch(() => undefined);
    },
  };
}

/* ───────────── Web Speech ───────────── */

function startWeb(Ctor: WebCtor, lang: string, h: VoiceHandlers): VoiceSession {
  let done = false;
  let rec: WebRecognition;
  try {
    rec = new Ctor();
  } catch (e) {
    h.onError(asVoiceError(e, WEB_CODES));
    return { stop: () => undefined, cancel: () => undefined };
  }
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 5;

  const fail = (e: VoiceError) => {
    if (done) return;
    done = true;
    h.onError(e);
  };

  rec.onstart = () => h.onPhase?.('listening');
  rec.onspeechend = () => {
    if (!done) h.onPhase?.('processing');
  };
  rec.onresult = (e) => {
    if (done) return;
    const res = e.results[e.results.length - 1];
    if (!res) return;
    const alts: string[] = [];
    for (let i = 0; i < res.length; i++) {
      const tr = res[i]?.transcript.trim();
      if (tr) alts.push(tr);
    }
    if (alts.length === 0) return;
    if (res.isFinal) {
      done = true;
      h.onFinal(alts);
    } else {
      // у Web Speech нет уровня громкости — «подпрыгиваем» на каждом промежуточном результате
      h.onLevel?.(0.7);
      h.onPartial?.(alts[0] as string);
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted') return;
    fail(asVoiceError({ code: e.error }, WEB_CODES));
  };
  rec.onend = () => fail(new VoiceError('no-speech'));

  try {
    rec.start();
  } catch (e) {
    fail(asVoiceError(e, WEB_CODES));
  }

  return {
    stop() {
      if (!done) rec.stop();
    },
    cancel() {
      if (done) return;
      done = true;
      try {
        rec.abort();
      } catch {
        /* уже остановлен */
      }
    },
  };
}

/**
 * Начинает прослушивание. Ошибки приходят через handlers.onError (а не исключением),
 * возвращаемая сессия безопасна для stop()/cancel() в любом состоянии.
 */
export async function startVoice(lang: string, handlers: VoiceHandlers): Promise<VoiceSession> {
  if (native) return startNative(native, lang, handlers);
  const Ctor = webCtor();
  if (!Ctor) {
    handlers.onError(new VoiceError('unavailable'));
    return { stop: () => undefined, cancel: () => undefined };
  }
  return startWeb(Ctor, lang, handlers);
}

/* ───────────── Обработка результата ───────────── */

/** Нормализует варианты как поисковые ключи: без регистра и знаков по краям, без дублей, не более 5. */
export function cleanAlternatives(raw: readonly string[], lang: VoiceLang): string[] {
  const norm = lang === 'ru' ? normalizeRu : normalizeEn;
  const out: string[] = [];
  for (const r of raw) {
    const k = norm(r);
    if (k && !out.includes(k)) out.push(k);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Выбирает лучший вариант: первый, который есть в словаре (exact), иначе просто первый.
 * Распознаватель часто путает близкие слова — словарь помогает выбрать верное.
 */
export function pickAlternative(
  candidates: readonly string[],
  known: (key: string) => boolean,
): { text: string; exact: boolean } | null {
  for (const c of candidates) if (known(c)) return { text: c, exact: true };
  const first = candidates[0];
  return first === undefined ? null : { text: first, exact: false };
}
