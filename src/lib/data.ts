import { SHARDS, shardName, shardOf } from './hash.ts';
import { parseWordList } from './search.ts';
import type { WordIndex } from './search.ts';
import { readFile } from './source.ts';
import type { Entry, Meta, SentencePair } from './types.ts';

/**
 * Доступ к словарю: скачанный пакет → кэш → сервер (см. source.ts).
 * Недоступность данных (нет сети и нет пакета) — исключение; «слова нет» — null/пустой результат.
 */

async function getJson<T>(path: string): Promise<T | null> {
  const text = await readFile(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const once = new Map<string, Promise<unknown>>();

/** Один запрос на файл. Неудачи не запоминаем — повтор возможен. */
function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = once.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().catch((e: unknown) => {
      once.delete(key);
      throw e;
    });
    once.set(key, p);
  }
  return p;
}

/** Шарды держим в памяти (последние ~64 файла). */
const SHARD_LIMIT = 64;

function shard<T>(folder: 'e' | 'r' | 's', key: string): Promise<Record<string, T>> {
  const name = `${folder}/${shardName(shardOf(key, SHARDS[folder]))}.json`;
  if (once.size > SHARD_LIMIT + 8) {
    for (const k of once.keys()) {
      if (k.includes('/') && once.size > SHARD_LIMIT) once.delete(k);
    }
  }
  return memo(name, async () => (await getJson<Record<string, T>>(name)) ?? {});
}

export const loadMeta = (): Promise<Meta | null> => memo('meta', () => getJson<Meta>('meta.json'));

const emptyIndex = (): WordIndex => ({ words: [], score: [], label: new Map() });

export const loadEnIndex = (): Promise<WordIndex> =>
  memo('words', async () => {
    const text = await readFile('words.txt');
    return text ? parseWordList(text) : emptyIndex();
  });

export const loadRuIndex = (): Promise<WordIndex> =>
  memo('rwords', async () => {
    const text = await readFile('rwords.txt');
    return text ? parseWordList(text) : emptyIndex();
  });

/** Статья по ключу (нормализованное английское слово). */
export async function getEntry(key: string): Promise<Entry | null> {
  const s = await shard<Entry>('e', key);
  return s[key] ?? null;
}

/** Английские слова для русского термина (ключ — normalizeRu). */
export async function getReverse(key: string): Promise<string[]> {
  const s = await shard<string[]>('r', key);
  return s[key] ?? [];
}

export async function getSentences(key: string): Promise<SentencePair[]> {
  try {
    const s = await shard<SentencePair[]>('s', key);
    return s[key] ?? [];
  } catch {
    return []; // примеры — не критичны: без сети просто не показываем
  }
}
