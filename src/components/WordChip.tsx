import { useResource } from '../hooks.ts';
import { loadEnIndex } from '../lib/data.ts';
import { hasWord } from '../lib/search.ts';
import { normalizeEn } from '../lib/text.ts';
import { openWord } from '../router.ts';
import { Chip } from './ui.tsx';

/** Английское слово-ссылка: кликабельно, только если оно есть в офлайн-словаре. */
export function WordChip({ word, tone = 'teal', sub }: { word: string; tone?: 'neutral' | 'teal' | 'accent'; sub?: string }) {
  const ix = useResource('index:en', loadEnIndex);
  const key = normalizeEn(word);
  const known = ix.status === 'ready' && ix.data ? hasWord(ix.data, key) : false;
  return (
    <Chip tone={known ? tone : 'neutral'} sub={sub} lang="en" onClick={known ? () => openWord(key) : undefined}>
      {word}
    </Chip>
  );
}
