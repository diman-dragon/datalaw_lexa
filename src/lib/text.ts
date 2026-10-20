const EDGE = /^[\s"'“”«»(\[]+|[\s"'“”«»)\].,;:!?]+$/g;

/** Ключ английского слова — как norm_en() в build_data.py. */
export function normalizeEn(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EDGE, '')
    .toLowerCase();
}

/** Ключ русского термина — как norm_ru(): без ударений, ё → е. */
export function normalizeRu(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[́̀]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EDGE, '')
    .toLowerCase()
    .replace(/ё/g, 'е');
}

export type Script = 'latin' | 'cyrillic' | 'other';

/** Определяет, на каком языке введён запрос (по первой букве). */
export function detectScript(text: string): Script {
  const m = /\p{L}/u.exec(text);
  if (!m) return 'other';
  if (/\p{Script=Cyrillic}/u.test(m[0])) return 'cyrillic';
  if (/\p{Script=Latin}/u.test(m[0])) return 'latin';
  return 'other';
}
