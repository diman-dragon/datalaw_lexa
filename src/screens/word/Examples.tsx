import { Highlight, Skeleton } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { useResource } from '../../hooks.ts';
import { t } from '../../i18n.ts';
import { getSentences } from '../../lib/data.ts';
import { LOCALE } from '../../lib/speech.ts';
import { say } from '../../speakUi.ts';
import type { Entry } from '../../lib/types.ts';
import { settings, useStore } from '../../store.ts';

function dictionaryExamples(entry: Entry | null): string[] {
  const out: string[] = [];
  for (const m of entry?.m ?? []) for (const s of m.s) for (const e of s.e ?? []) if (!out.includes(e)) out.push(e);
  return out.slice(0, 8);
}

export function Examples({ word, entry }: { word: string; entry: Entry | null }) {
  const s = useStore(settings);
  const sentences = useResource(`sent:${word}`, () => getSentences(word));
  const fromDict = dictionaryExamples(entry);
  const pairs = sentences.data ?? [];

  const hear = (text: string) => {
    void say(text, LOCALE[s.accent]);
  };

  const nothing = fromDict.length === 0 && sentences.status === 'ready' && pairs.length === 0;

  return (
    <div>
      {fromDict.length > 0 ? (
        <section class="block">
          <h3 class="block__title">{t('exDict')}</h3>
          <ul class="sentences">
            {fromDict.map((ex) => (
              <li class="sentence" key={ex}>
                <div class="sentence__main">
                  <p lang="en">
                    <Highlight text={ex} word={word} />
                  </p>
                </div>
                <button type="button" class="iconbtn iconbtn--sm" onClick={() => hear(ex)} aria-label={t('pronounce')}>
                  <Icon name="volume" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sentences.status === 'loading' ? <Skeleton lines={3} /> : null}

      {pairs.length > 0 ? (
        <section class="block">
          <h3 class="block__title">{t('exSentences')}</h3>
          <ul class="sentences">
            {pairs.map(([en, ru]) => (
              <li class="sentence" key={en}>
                <div class="sentence__main">
                  <p lang="en">
                    <Highlight text={en} word={word} />
                  </p>
                  <p class="sentence__tr" lang="ru">
                    {ru}
                  </p>
                </div>
                <button type="button" class="iconbtn iconbtn--sm" onClick={() => hear(en)} aria-label={t('pronounce')}>
                  <Icon name="volume" size={18} />
                </button>
              </li>
            ))}
          </ul>
          <p class="src">{t('exSource')}</p>
        </section>
      ) : null}

      {nothing ? <p class="muted block">{t('exNone')}</p> : null}
    </div>
  );
}
