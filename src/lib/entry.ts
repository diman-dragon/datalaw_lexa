import type { Accent, Entry, TrGroup, TrTerm } from './types.ts';

export const termText = (t: TrTerm): string => (typeof t === 'string' ? t : t.w);

export function ipaFor(entry: Entry, accent: Accent): string | undefined {
  const list = entry.p ?? [];
  return list.find((p) => p[1] === accent)?.[0] ?? list[0]?.[0];
}

export function accentsAvailable(entry: Entry): Accent[] {
  return [...new Set((entry.p ?? []).map((p) => p[1]).filter((a): a is 'us' | 'uk' => a === 'us' || a === 'uk'))];
}

export function firstDefinition(entry: Entry | null | undefined, max = 90): string | undefined {
  const d = entry?.m?.[0]?.s[0]?.d;
  if (!d) return undefined;
  return d.length > max ? `${d.slice(0, max - 1)}…` : d;
}

/** Самые частые переводы — по одному из каждого значения, без повторов. */
export function topTranslations(groups: TrGroup[] | undefined, limit = 4): string[] {
  if (!groups) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const rounds = Math.max(0, ...groups.map((g) => g.t.length));
  for (let i = 0; i < rounds && out.length < limit; i++) {
    for (const g of groups) {
      const term = g.t[i];
      if (!term) continue;
      const text = termText(term);
      if (seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      out.push(text);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export type FrequencyBand = 'veryCommon' | 'common' | 'uncommon' | 'rare';

/** z — Zipf × 10: 50+ — «the», «have»; 40+ — обычная лексика; 30+ — редкая; ниже — очень редкая. */
export function frequencyBand(z: number | undefined): FrequencyBand | undefined {
  if (z === undefined || z <= 0) return undefined;
  if (z >= 50) return 'veryCommon';
  if (z >= 40) return 'common';
  if (z >= 30) return 'uncommon';
  return 'rare';
}

export const BAND_LEVEL: Record<FrequencyBand, 1 | 2 | 3 | 4> = {
  veryCommon: 4,
  common: 3,
  uncommon: 2,
  rare: 1,
};

/** Слова дня — выразительная лексика B2–C2; в словарь попадают, если есть в данных. */
export const WORDS_OF_THE_DAY: readonly string[] = [
  'serendipity', 'ephemeral', 'ineffable', 'mellifluous', 'ubiquitous', 'pragmatic', 'eloquent',
  'resilient', 'nostalgia', 'labyrinth', 'solitude', 'luminous', 'meticulous', 'candid', 'ambiguous',
  'whimsical', 'tenacious', 'serene', 'vivid', 'quaint', 'zeal', 'benevolent', 'diligent', 'elusive',
  'enigma', 'gregarious', 'harbinger', 'juxtapose', 'kindle', 'lucid', 'meander', 'nuance', 'obscure',
  'paradox', 'reminisce', 'tangible', 'unwavering', 'venerable', 'wanderlust', 'zenith', 'acumen',
  'ardent', 'bucolic', 'capricious', 'dichotomy', 'formidable', 'halcyon', 'impeccable', 'jubilant',
  'languid', 'nebulous', 'opulent', 'pensive', 'quixotic', 'sanguine', 'taciturn', 'utopia', 'wistful',
  'yearn', 'zephyr', 'brevity', 'catharsis', 'dexterity', 'empathy', 'grapple', 'hubris', 'imminent',
  'levity', 'mirth', 'oblivion', 'perennial', 'reverie', 'solace', 'verdant', 'zest', 'alacrity',
  'burgeon', 'clandestine', 'deft', 'enthrall', 'flourish', 'grit', 'illuminate',
];

function dayNumber(d = new Date()): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export function wordOfTheDay(offset = 0): string {
  const n = WORDS_OF_THE_DAY.length;
  return WORDS_OF_THE_DAY[(((dayNumber() + offset) % n) + n) % n] ?? 'serendipity';
}
