import { useEffect, useState } from 'preact/hooks';
import { Header } from '../components/Header.tsx';
import { Icon } from '../components/Icon.tsx';
import { Chip, ErrorBox, Segmented, Skeleton } from '../components/ui.tsx';
import { useResource } from '../hooks.ts';
import type { StringKey } from '../i18n.ts';
import { t } from '../i18n.ts';
import { getEntry, loadEnIndex } from '../lib/data.ts';
import {
  BAND_LEVEL,
  accentsAvailable,
  firstDefinition,
  frequencyBand,
  ipaFor,
  topTranslations,
} from '../lib/entry.ts';
import type { FrequencyBand } from '../lib/entry.ts';
import { suggestSimilar } from '../lib/search.ts';
import { LOCALE, speak, stopSpeaking } from '../lib/speech.ts';
import { normalizeEn } from '../lib/text.ts';
import { DataUnavailableError } from '../lib/source.ts';
import { shareText, tap } from '../native.ts';
import { navigate, openWord } from '../router.ts';
import { isSaved, pushHistory, saved, settings, showToast, toggleSaved, useStore } from '../store.ts';
import { Definitions } from './word/Definitions.tsx';
import { Examples } from './word/Examples.tsx';
import { Thesaurus } from './word/Thesaurus.tsx';
import { Translations } from './word/Translations.tsx';

const FREQ_KEY: Record<FrequencyBand, StringKey> = {
  veryCommon: 'freqVeryCommon',
  common: 'freqCommon',
  uncommon: 'freqUncommon',
  rare: 'freqRare',
};

type Tab = 'defs' | 'tr' | 'thes' | 'ex';
type Accent = 'us' | 'uk';

function NotFound({ word }: { word: string }) {
  const ix = useResource('index:en', loadEnIndex);
  const options = ix.data ? suggestSimilar(ix.data, word, 8) : [];
  return (
    <div class="empty">
      <div class="empty__icon">
        <Icon name="search" size={30} />
      </div>
      <h2>{t('wordNotFound')}</h2>
      {options.length > 0 ? (
        <>
          <p>{t('wordNotFoundHint')}</p>
          <div class="chips chips--center">
            {options.map((h) => (
              <Chip key={h.key} tone="teal" lang="en" onClick={() => openWord(h.key, true)}>
                {h.label}
              </Chip>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function WordScreen({ word }: { word: string }) {
  const s = useStore(settings);
  const savedList = useStore(saved);
  const key = normalizeEn(word);
  const [tab, setTab] = useState<Tab>('defs');
  const [accent, setAccent] = useState<Accent>(s.accent);
  const [playing, setPlaying] = useState(false);

  const res = useResource(`entry:${key}`, () => getEntry(key));
  const entry = res.data ?? null;
  const isForm = !!entry?.r;

  useEffect(() => {
    if (res.status === 'ready' && entry) pushHistory(key);
  }, [key, res.status, entry]);

  useEffect(() => () => stopSpeaking(), [key]);

  const display = entry?.w ?? word;
  const isFav = isSaved(savedList, key);
  const band = frequencyBand(entry?.z);
  const ipa = entry ? ipaFor(entry, accent) : undefined;
  const accents = entry ? accentsAvailable(entry) : [];
  const glossLine = topTranslations(entry?.tr, 4).join(' · ');

  const onPronounce = async () => {
    tap();
    setPlaying(true);
    try {
      await speak(display, LOCALE[accent]);
    } catch {
      showToast(t('toastNoVoice'));
    } finally {
      setPlaying(false);
    }
  };

  const onToggleSaved = () => {
    tap('medium');
    const nowSaved = toggleSaved(key, firstDefinition(entry));
    showToast(nowSaved ? t('toastSaved') : t('toastRemoved'));
  };

  const onShare = async () => {
    const lines = [display + (ipa ? `  ${ipa}` : '')];
    if (glossLine) lines.push(glossLine);
    for (const m of entry?.m?.slice(0, 3) ?? []) {
      const d = m.s[0]?.d;
      if (d) lines.push(`${m.t}: ${d}`);
    }
    try {
      if ((await shareText(display, lines.join('\n'))) === 'copied') showToast(t('toastCopied'));
    } catch {
      /* пользователь закрыл меню */
    }
  };

  const tabs: ReadonlyArray<{ value: Tab; label: string }> = [
    { value: 'defs', label: t('tabDefinitions') },
    { value: 'tr', label: t('tabTranslations') },
    { value: 'thes', label: t('tabThesaurus') },
    { value: 'ex', label: t('tabExamples') },
  ];

  return (
    <>
      <Header
        back
        actions={
          <>
            <button type="button" class="iconbtn" onClick={() => void onShare()} aria-label={t('share')}>
              <Icon name="share" />
            </button>
            <button
              type="button"
              class={isFav ? 'iconbtn is-on' : 'iconbtn'}
              onClick={onToggleSaved}
              aria-label={isFav ? t('removeFromSaved') : t('addToSaved')}
              aria-pressed={isFav}
            >
              <Icon name="star" filled={isFav} />
            </button>
          </>
        }
      />

      <section class="word-head">
        <h2 class="word-title" lang="en">
          {display}
        </h2>
        <div class="ipa-row">
          <button
            type="button"
            class={playing ? 'speak is-playing' : 'speak'}
            onClick={() => void onPronounce()}
            aria-label={t('pronounce')}
          >
            <Icon name="volume" size={22} />
          </button>
          {ipa ? <span class="ipa">{ipa}</span> : null}
          {accents.length > 1 ? (
            <Segmented<Accent>
              variant="pills"
              value={accent}
              onChange={setAccent}
              options={[
                { value: 'us', label: 'US' },
                { value: 'uk', label: 'UK' },
              ]}
            />
          ) : null}
        </div>
        {glossLine ? (
          <p class="word-gloss" lang="ru">
            {glossLine}
          </p>
        ) : null}
        {band ? (
          <div class="meta-row">
            <span class="freq">
              <span class="freq__dots" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                  <i key={i} class={i <= BAND_LEVEL[band] ? 'on' : ''} />
                ))}
              </span>
              {t(FREQ_KEY[band])}
            </span>
          </div>
        ) : null}
      </section>

      {res.status === 'loading' ? <Skeleton lines={6} /> : null}

      {res.status === 'error' ? (
        <ErrorBox
          offline={res.error instanceof DataUnavailableError}
          onRetry={res.reload}
          onSettings={() => navigate({ name: 'settings' })}
        />
      ) : null}

      {res.status === 'ready' && !entry ? <NotFound word={key} /> : null}

      {isForm && entry ? (
        <div class="notice notice--form">
          <div class="notice__body">
            <strong>{t('formOf')}</strong>
            {entry.rg ? <span lang="en"> — {entry.rg}</span> : null}
          </div>
          {(entry.r ?? []).map((lemma) => (
            <Chip key={lemma} tone="teal" lang="en" onClick={() => openWord(lemma, true)}>
              {t('openLemma')} {lemma}
            </Chip>
          ))}
        </div>
      ) : null}

      {entry && !isForm ? (
        <>
          <Segmented<Tab> variant="tabs" value={tab} onChange={setTab} options={tabs} />
          <div class="tabpanel" role="tabpanel">
            {tab === 'defs' ? <Definitions entry={entry} /> : null}
            {tab === 'tr' ? <Translations entry={entry} /> : null}
            {tab === 'thes' ? <Thesaurus entry={entry} /> : null}
            {tab === 'ex' ? <Examples word={key} entry={entry} /> : null}
          </div>
        </>
      ) : null}
    </>
  );
}
