import { useEffect, useState } from 'preact/hooks';
import { Segmented } from '../../components/ui.tsx';
import { WordChip } from '../../components/WordChip.tsx';
import type { StringKey } from '../../i18n.ts';
import { t } from '../../i18n.ts';
import type { Entry, RelationKey } from '../../lib/types.ts';

const ORDER: RelationKey[] = ['syn', 'ant', 'hyper', 'hypo', 'rel', 'der', 'coord'];

const LABEL: Record<RelationKey, StringKey> = {
  syn: 'relSyn',
  ant: 'relAnt',
  hyper: 'relHyper',
  hypo: 'relHypo',
  rel: 'relRel',
  der: 'relDer',
  coord: 'relCoord',
};

/** Синонимы и антонимы значений тоже попадают в общий список. */
function collect(entry: Entry): Partial<Record<RelationKey, string[]>> {
  const out: Partial<Record<RelationKey, string[]>> = {};
  for (const key of ORDER) {
    const words = [...(entry.rel?.[key] ?? [])];
    if (key === 'syn' || key === 'ant') {
      for (const m of entry.m ?? []) {
        for (const s of m.s) for (const w of (key === 'syn' ? s.y : s.a) ?? []) if (!words.includes(w)) words.push(w);
      }
    }
    if (words.length > 0) out[key] = words;
  }
  return out;
}

export function Thesaurus({ entry }: { entry: Entry | null }) {
  const rels = entry ? collect(entry) : {};
  const available = ORDER.filter((k) => (rels[k]?.length ?? 0) > 0);
  const [rel, setRel] = useState<RelationKey>(available[0] ?? 'syn');

  useEffect(() => {
    if (!available.includes(rel) && available[0]) setRel(available[0]);
  }, [available.join(','), rel]);

  if (available.length === 0) return <p class="muted block">{t('relEmpty')}</p>;

  return (
    <div>
      <Segmented<RelationKey>
        variant="pills"
        value={rel}
        onChange={setRel}
        options={available.map((r) => ({ value: r, label: t(LABEL[r]) }))}
      />
      <div class="block">
        <div class="chips">
          {(rels[rel] ?? []).map((w) => (
            <WordChip key={w} word={w} tone={rel === 'ant' ? 'accent' : 'teal'} />
          ))}
        </div>
        <p class="src">Wiktionary · CC BY-SA</p>
      </div>
    </div>
  );
}
