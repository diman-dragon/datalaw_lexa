import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n.ts';
import { startVoice, voiceLocale } from '../lib/voice.ts';
import type { VoiceErrorKind, VoiceLang, VoiceSession } from '../lib/voice.ts';
import { pushBackHandler, tap } from '../native.ts';
import { createStore, settings, updateSettings, useStore } from '../store.ts';
import type { StringKey } from '../i18n.ts';
import { Icon } from './Icon.tsx';

type Phase = 'starting' | 'listening' | 'processing' | 'error';

interface View {
  phase: Phase;
  partial: string;
  error?: VoiceErrorKind;
}

const ERROR_TEXT: Record<VoiceErrorKind, StringKey> = {
  permission: 'voiceErrPermission',
  unavailable: 'voiceErrUnavailable',
  network: 'voiceErrNetwork',
  'no-speech': 'voiceErrNoSpeech',
  lang: 'voiceErrLang',
  busy: 'voiceErrBusy',
  failed: 'voiceErrFailed',
};

const STATUS_TEXT: Record<Phase, StringKey> = {
  starting: 'voicePreparing',
  listening: 'voiceListening',
  processing: 'voiceProcessing',
  error: 'voiceTitle',
};

const LANGS: ReadonlyArray<{ value: VoiceLang; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

interface Props {
  onClose: () => void;
  /** Варианты распознавания (лучший первым) и язык, на котором говорили */
  onResult: (alternatives: string[], lang: VoiceLang) => void;
}

/**
 * Окно голосового ввода: шторка снизу с «дышащей» кнопкой-микрофоном, кольцами и столбиками,
 * реагирующими на громкость голоса, и бегущей строкой распознанного слова.
 */
export function VoiceSheet({ onClose, onResult }: Props) {
  const s = useStore(settings);
  const lang = s.voiceLang;
  const [view, setView] = useState<View>({ phase: 'starting', partial: '' });
  const [attempt, setAttempt] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const session = useRef<VoiceSession | null>(null);
  const level = useRef(0);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = () => closeRef.current();

  /* Запуск прослушивания; перезапускается при смене языка и по «Повторить». */
  useEffect(() => {
    let live = true;
    level.current = 0;
    panel.current?.style.setProperty('--lvl', '0');
    setView({ phase: 'starting', partial: '' });

    void startVoice(voiceLocale(lang, settings.get().accent), {
      onPhase: (phase) => {
        if (live) setView((v) => ({ ...v, phase }));
      },
      onLevel: (raw) => {
        if (!live) return;
        // сглаживаем: рост быстрый, спад плавный — столбики не «дёргаются»
        level.current = raw > level.current ? level.current * 0.35 + raw * 0.65 : level.current * 0.8 + raw * 0.2;
        panel.current?.style.setProperty('--lvl', level.current.toFixed(3));
      },
      onPartial: (partial) => {
        if (live) setView((v) => ({ ...v, partial }));
      },
      onFinal: (alts) => {
        if (!live) return;
        live = false;
        tap('medium');
        resultRef.current(alts, lang);
      },
      onError: (e) => {
        if (live) setView({ phase: 'error', partial: '', error: e.kind });
      },
    }).then((sess) => {
      if (live) session.current = sess;
      else sess.cancel();
    });

    return () => {
      live = false;
      session.current?.cancel();
      session.current = null;
    };
  }, [lang, attempt]);

  /* Системная «Назад» и Esc закрывают окно. */
  useEffect(() => {
    const off = pushBackHandler(() => closeRef.current());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const onOrb = () => {
    tap();
    if (view.phase === 'error') setAttempt((n) => n + 1);
    else if (view.phase === 'listening') session.current?.stop();
  };

  const pickLang = (next: VoiceLang) => {
    if (next === lang) return;
    tap();
    updateSettings({ voiceLang: next });
  };

  const failed = view.phase === 'error';
  const busy = view.phase === 'starting' || view.phase === 'processing';
  const status = t(STATUS_TEXT[view.phase]);
  const orbLabel = failed ? t('voiceRetry') : view.phase === 'listening' ? t('voiceStop') : status;

  return (
    <div class="vsheet" role="dialog" aria-modal="true" aria-label={t('voiceTitle')}>
      <div class="vsheet__backdrop" onClick={close} />
      <div class={`vsheet__panel vsheet__panel--${view.phase}`} ref={panel} style="--lvl:0">
        <span class="vsheet__grab" aria-hidden="true" />

        <div class="vsheet__top">
          <div class="vlang" role="radiogroup" aria-label={t('voiceLangLabel')}>
            {LANGS.map((l) => (
              <button
                key={l.value}
                type="button"
                role="radio"
                aria-checked={l.value === lang}
                class={l.value === lang ? 'on' : ''}
                onClick={() => pickLang(l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button type="button" class="iconbtn" onClick={close} aria-label={t('voiceClose')}>
            <Icon name="close" />
          </button>
        </div>

        <p class="vsheet__status" aria-live="polite">
          {status}
        </p>

        {failed ? (
          <p class="vsheet__error" role="alert">
            {t(ERROR_TEXT[view.error ?? 'failed'])}
          </p>
        ) : (
          <p class={view.partial ? 'vsheet__word' : 'vsheet__word is-empty'} lang={lang}>
            {view.partial || t('voiceSayWord')}
          </p>
        )}

        <div class="vstage">
          <span class="vstage__ring vstage__ring--lvl" />
          <span class="vstage__ring vstage__ring--a" />
          <span class="vstage__ring vstage__ring--b" />
          <button
            type="button"
            class={`vorb vorb--${view.phase}`}
            onClick={onOrb}
            disabled={view.phase === 'processing' || view.phase === 'starting'}
            aria-label={orbLabel}
          >
            <Icon name={view.phase === 'listening' ? 'stop' : 'mic'} size={34} />
          </button>
        </div>

        <div class="vbars" aria-hidden="true">
          {busy && view.phase === 'processing' ? (
            <>
              <i class="vdot" />
              <i class="vdot" />
              <i class="vdot" />
            </>
          ) : (
            [0.55, 0.9, 1.25, 0.9, 0.55].map((k, i) => (
              <span key={i} class="vbar" style={`--k:${k}`}>
                <i style={`animation-delay:${i * 0.12}s`} />
              </span>
            ))
          )}
        </div>

        <p class="vsheet__hint">{failed ? t('voiceHintRetry') : view.phase === 'listening' ? t('voiceHintTap') : '\u00a0'}</p>
      </div>
    </div>
  );
}

/* ───────────── Хост: окно рисуется в корне приложения, поверх нижней навигации ───────────── */

type ResultHandler = (alternatives: string[], lang: VoiceLang) => void;

const request = createStore<{ id: number; onResult: ResultHandler } | null>(null);

/** Открывает окно голосового ввода; onResult вызывается один раз, когда слово распознано. */
export function openVoice(onResult: ResultHandler): void {
  request.set({ id: Date.now(), onResult });
}

export function closeVoice(): void {
  request.set(null);
}

/** Монтируется один раз в App — за пределами прокручиваемого экрана (иначе его перекрывает таб-бар). */
export function VoiceHost() {
  const r = useStore(request);
  if (!r) return null;
  return (
    <VoiceSheet
      key={r.id}
      onClose={closeVoice}
      onResult={(alts, lang) => {
        closeVoice();
        r.onResult(alts, lang);
      }}
    />
  );
}
