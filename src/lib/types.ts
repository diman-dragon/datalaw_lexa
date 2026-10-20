/** Форматы офлайн-данных (см. scripts/build_data.py). Короткие ключи — для компактности JSON. */

export type Accent = 'us' | 'uk' | 'au' | 'other';

export interface Sense {
  /** определение */
  d: string;
  /** примеры */
  e?: string[];
  /** синонимы значения */
  y?: string[];
  /** антонимы значения */
  a?: string[];
  /** пометки: informal, slang, obsolete … */
  g?: string[];
}

export interface Meaning {
  /** часть речи (noun, verb, adjective …) */
  t: string;
  s: Sense[];
}

export type TrTerm = string | { w: string; r?: string; x?: string };

export interface TrGroup {
  pos?: string;
  /** значение, к которому относятся переводы */
  g?: string;
  t: TrTerm[];
}

export type RelationKey = 'syn' | 'ant' | 'hyper' | 'hypo' | 'rel' | 'der' | 'coord';

export type Related = Partial<Record<RelationKey, string[]>>;

export interface Entry {
  /** написание */
  w: string;
  /** Zipf-частотность × 10 */
  z?: number;
  /** транскрипции [IPA, акцент] */
  p?: Array<[string, Accent]>;
  m?: Meaning[];
  tr?: TrGroup[];
  rel?: Related;
  /** этимология */
  et?: string;
  /** перенаправление: это форма другого слова */
  r?: string[];
  /** пояснение формы («simple past of run») */
  rg?: string;
}

export interface Meta {
  schema: number;
  built: string;
  words: number;
  forms: number;
  translated: number;
  ruTerms: number;
  sentences: number;
  frequency: boolean;
  sources: string[];
}

export type SentencePair = [en: string, ru: string];
