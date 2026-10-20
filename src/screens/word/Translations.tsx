import { Chip } from '../../components/ui.tsx';
import { markLabel, posLabel, t } from '../../i18n.ts';
import { LOCALE, speak } from '../../lib/speech.ts';
import type { Entry } from '../../lib/types.ts';
import { showToast } from '../../store.ts';

export function Translations({ entry }: { entry: Entry | null }) {
  const groups = entry?.tr ?? [];

  const hear = (text: string) => {
    speak(text, LOCALE.ru).catch(() => showToast(t('toastNoVoice')));
  };

  if (groups.length === 0) {
    return <p class="muted block">{t('trNone')}</p>;
  }

  return (
    <section class="block">
      <h3 class="block__title">{t('trGroupsTitle')}</h3>
      {groups.map((g, i) => (
        <div class="tr-group" key={`${g.pos ?? ''}:${g.g ?? ''}:${i}`}>
          <div class="tr-gloss">
            {g.pos ? <span class="tr-pos">{posLabel(g.pos)}</span> : null}
            {g.g ? <span lang="en">{g.g}</span> : null}
          </div>
          <div class="chips">
            {g.t.map((term) => {
              const text = typeof term === 'string' ? term : term.w;
              const sub =
                typeof term === 'string'
                  ? undefined
                  : [term.r, term.x ? markLabel(term.x) : undefined].filter(Boolean).join(' · ') || undefined;
              return (
                <Chip key={text} tone="teal" lang="ru" sub={sub} onClick={() => hear(text)}>
                  {text}
                </Chip>
              );
            })}
          </div>
        </div>
      ))}
      <p class="src">
        {t('trTapHear')} · {t('trSource')}
      </p>
    </section>
  );
}
