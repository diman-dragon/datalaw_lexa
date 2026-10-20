import { SHARDS, shardName, shardOf } from './hash.ts';
import { parseWordList } from './search.ts';
import type { WordIndex } from './search.ts';
import type { Entry, Meta, SentencePair } from './types.ts';

/**
 * Офлайн-данные лежат в ресурсах приложения (public/data → assets/public/data в APK)
 * и читаются обычным fetch по относительному адресу — сеть не нужна.
 */
const base = (): string => `${import.meta.env.BASE_URL}data/`;

async function getText(path: string): Promise<string | null> {
  try {
    const res = await fetch(base() + path);
    if (!res.ok) return null;
    const text = await res.text();
    // dev-сервер на отсутствующий файл отдаёт index.html — считаем, что файла нет
    return text.startsWith('<') ? null : text;
  } catch {
    return null;
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  const text = await getText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const once = new Map<string, Promise<unknown>>();

/** Один запрос на файл, даже если спрашивают одновременно. */
function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = once.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    once.set(key, p);
  }
  return p;
}

/** Результаты шардов держим в памяти (последние ~64 файла). */
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
    const text = await getText('words.txt');
    return text ? parseWordList(text) : emptyIndex();
  });

export const loadRuIndex = (): Promise<WordIndex> =>
  memo('rwords', async () => {
    const text = await getText('rwords.txt');
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
  const s = await shard<SentencePair[]>('s', key);
  return s[key] ?? [];
}
