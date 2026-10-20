import { Header } from '../components/Header.tsx';
import { Icon } from '../components/Icon.tsx';
import { EmptyState, Skeleton } from '../components/ui.tsx';
import { useResource } from '../hooks.ts';
import { t } from '../i18n.ts';
import { getEntry, getReverse } from '../lib/data.ts';
import { firstDefinition } from '../lib/entry.ts';
import { normalizeRu } from '../lib/text.ts';
import { openWord } from '../router.ts';

function Row({ word }: { word: string }) {
  const res = useResource(`entry:${word}`, () => getEntry(word));
  const entry = res.data ?? null;
  return (
    <li>
      <button type="button" class="row" onClick={() => openWord(word)}>
        <span class="row__open-inner">
          <span class="row__main" lang="en">
            {entry?.w ?? word}
          </span>
          {entry && !entry.r ? <span class="row__sub">{firstDefinition(entry, 110)}</span> : null}
        </span>
        <Icon name="arrow-right" size={18} />
      </button>
    </li>
  );
}

/** Обратный поиск: русское слово → английские эквиваленты (из переводов Викисловаря). */
export function FindScreen({ query }: { query: string }) {
  const key = normalizeRu(query);
  const res = useResource(`rev:${key}`, () => getReverse(key));
  const words = res.data ?? [];

  return (
    <>
      <Header back title={t('findTitle', { q: query })} />
      {res.status === 'loading' ? <Skeleton lines={4} /> : null}
      {res.status === 'ready' && words.length === 0 ? <EmptyState icon="search" text={t('findEmpty')} /> : null}
      {words.length > 0 ? (
        <>
          <p class="muted">{t('findHint')}</p>
          <ul class="list">
            {words.slice(0, 40).map((w) => (
              <Row key={w} word={w} />
            ))}
          </ul>
          <p class="src">{t('trSource')}</p>
        </>
      ) : null}
    </>
  );
}
