import { useState } from 'preact/hooks';
import { WordChip } from '../../components/WordChip.tsx';
import { posLabel, t, tagLabel } from '../../i18n.ts';
import type { Entry, Meaning, Sense } from '../../lib/types.ts';

function SenseRow({ sense, index }: { sense: Sense; index: number }) {
  return (
    <li class="sense">
      <span class="sense__num">{index + 1}</span>
      <div class="sense__body">
        {sense.g?.length ? (
          <div class="sense__tags">
            {sense.g.map((tag) => (
              <span key={tag} class="tag">
                {tagLabel(tag)}
              </span>
            ))}
          </div>
        ) : null}
        <p class="sense__def" lang="en">
          {sense.d}
        </p>
        {sense.e?.[0] ? (
          <p class="sense__ex" lang="en">
            “{sense.e[0]}”
          </p>
        ) : null}
        {sense.y?.length ? (
          <div class="chips chips--tight">
            {sense.y.slice(0, 6).map((w) => (
              <WordChip key={w} word={w} />
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function PosBlock({ meaning, ant }: { meaning: Meaning; ant: string[] }) {
  const [all, setAll] = useState(false);
  const limit = 5;
  const senses = all ? meaning.s : meaning.s.slice(0, limit);
  return (
    <section class="pos">
      <h3 class="pos__label">{posLabel(meaning.t)}</h3>
      <ol class="senses">
        {senses.map((sense, i) => (
          <SenseRow key={sense.d} sense={sense} index={i} />
        ))}
      </ol>
      {meaning.s.length > limit && !all ? (
        <button type="button" class="link-btn" onClick={() => setAll(true)}>
          {t('seeAll')} ({meaning.s.length - limit})
        </button>
      ) : null}
      {ant.length > 0 ? (
        <div class="relgroup">
          <h4 class="relgroup__title">{t('sectionAntonyms')}</h4>
          <div class="chips">
            {ant.slice(0, 10).map((w) => (
              <WordChip key={w} word={w} tone="accent" />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function Definitions({ entry }: { entry: Entry }) {
  const meanings = entry.m ?? [];
  const ant = entry.rel?.ant ?? [];
  return (
    <div>
      {meanings.map((m, i) => (
        // антонимы статьи показываем под первой частью речи, чтобы не дублировать
        <PosBlock key={m.t} meaning={m} ant={i === 0 ? ant : []} />
      ))}
      {entry.et ? (
        <section class="block">
          <h3 class="block__title">{t('etymology')}</h3>
          <p class="etym" lang="en">
            {entry.et}
          </p>
        </section>
      ) : null}
      <p class="src">Wiktionary · CC BY-SA</p>
    </div>
  );
}

