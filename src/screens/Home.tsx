import { useState } from 'preact/hooks';
import { Icon, LogoMark } from '../components/Icon.tsx';
import { Chip, EmptyState, Skeleton } from '../components/ui.tsx';
import { useDebounced, useResource } from '../hooks.ts';
import { t } from '../i18n.ts';
import { getEntry, loadEnIndex, loadMeta, loadRuIndex } from '../lib/data.ts';
import { WORDS_OF_THE_DAY, firstDefinition, ipaFor, topTranslations, wordOfTheDay } from '../lib/entry.ts';
import { indexOfWord, prefixSearch } from '../lib/search.ts';
import type { Hit } from '../lib/search.ts';
import { detectScript, normalizeEn, normalizeRu } from '../lib/text.ts';
import { tap } from '../native.ts';
import { navigate, openWord } from '../router.ts';
import { history, settings, useStore } from '../store.ts';

function WordOfTheDay() {
  const s = useStore(settings);
  const [offset, setOffset] = useState(0);
  const word = wordOfTheDay(offset);
  const res = useResource(`entry:${word}`, () => getEntry(word));
  const entry = res.data ?? null;
  if (res.status === 'ready' && !entry) {
    // слова нет в собранном словаре (например, образец данных) — не показываем пустую карточку
    return null;
  }
  const def = firstDefinition(entry, 140);
  const ipa = entry ? ipaFor(entry, s.accent) : undefined;
  const ru = topTranslations(entry?.tr, 3).join(' · ');

  return (
    <section class="card wotd">
      <div class="wotd__top">
        <span class="eyebrow">
          <Icon name="sparkle" size={14} /> {t('homeWotd')}
        </span>
        <button
          type="button"
          class="iconbtn iconbtn--sm"
          aria-label={t('homeRandom')}
          onClick={() => {
            tap();
            setOffset((o) => o + 1 + Math.floor(Math.random() * (WORDS_OF_THE_DAY.length - 1)));
          }}
        >
          <Icon name="shuffle" size={18} />
        </button>
      </div>
      <button type="button" class="wotd__main" onClick={() => openWord(word)}>
        <span class="wotd__word" lang="en">
          {word}
        </span>
        {ipa ? <span class="ipa">{ipa}</span> : null}
        {res.status === 'loading' ? <Skeleton lines={2} /> : null}
        {ru ? (
          <span class="wotd__ru" lang="ru">
            {ru}
          </span>
        ) : null}
        {def ? <span class="wotd__def">{def}</span> : null}
      </button>
    </section>
  );
}

export function HomeScreen() {
  const hist = useStore(history);
  const [text, setText] = useState('');
  const q = text.trim();
  const script = detectScript(q);
  const key = script === 'cyrillic' ? normalizeRu(q) : normalizeEn(q);
  const debounced = useDebounced(key, 60);

  const meta = useResource('meta', loadMeta);
  const enIx = useResource('index:en', loadEnIndex);
  const ruIx = useResource('index:ru', loadRuIndex);

  const hits: Hit[] =
    debounced && debounced === key
      ? script === 'cyrillic' && ruIx.data
        ? prefixSearch(ruIx.data, debounced, 8)
        : script === 'latin' && enIx.data
          ? prefixSearch(enIx.data, debounced, 8)
          : []
      : [];

  const go = (hit: string) => {
    tap();
    if (script === 'cyrillic') navigate({ name: 'find', query: hit });
    else openWord(hit);
  };

  const submit = (e: Event) => {
    e.preventDefault();
    if (!key) return;
    if (script === 'cyrillic') {
      const exact = ruIx.data ? indexOfWord(ruIx.data, key) >= 0 : false;
      go(exact ? key : (hits[0]?.key ?? key));
    } else {
      go(key);
    }
  };

  const noData = meta.status === 'ready' && !meta.data;

  return (
    <>
      <section class="hero">
        <div class="hero__bar">
          <div class="hero__brand">
            <LogoMark size={30} />
            <span>{t('appName')}</span>
          </div>
          <button type="button" class="iconbtn" onClick={() => navigate({ name: 'settings' })} aria-label={t('openSettings')}>
            <Icon name="settings" />
          </button>
        </div>
        <h1 class="hero__title">{t('homeHeadline')}</h1>
        <p class="hero__sub">{t('homeSub')}</p>

        <form class="search" onSubmit={submit} role="search">
          <Icon name="search" size={20} class="search__icon" />
          <input
            class="search__input"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autocomplete="off"
            autocapitalize="none"
            spellcheck={false}
            placeholder={t('searchPlaceholder')}
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            aria-label={t('searchPlaceholder')}
          />
          {text ? (
            <button type="button" class="search__clear" onClick={() => setText('')} aria-label={t('searchClear')}>
              <Icon name="close" size={18} />
            </button>
          ) : null}
        </form>

        {hits.length > 0 ? (
          <ul class="suggest">
            {hits.map((h) => (
              <li key={h.key}>
                <button type="button" class="suggest__item" onClick={() => go(h.key)}>
                  <Icon name={script === 'cyrillic' ? 'translate' : 'search'} size={18} />
                  <span lang={script === 'cyrillic' ? 'ru' : 'en'}>{h.label}</span>
                  <Icon name="arrow-ul" size={16} class="suggest__fill" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {noData ? <EmptyState icon="search" title={t('dataMissingTitle')} text={t('dataMissingBody')} /> : null}

      {q.length === 0 && !noData ? (
        <>
          <WordOfTheDay />

          {hist.length > 0 ? (
            <section class="section">
              <h2 class="section__title">{t('homeRecent')}</h2>
              <div class="chips">
                {hist.slice(0, 10).map((h) => (
                  <Chip key={h.word} lang="en" onClick={() => openWord(h.word)}>
                    {h.word}
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}

          <section class="card tip">
            <h2>{t('homeTipTitle')}</h2>
            <p>{t('homeTipBody')}</p>
          </section>
          <p class="src src--center">{t('attribution')}</p>
        </>
      ) : null}
    </>
  );
}
