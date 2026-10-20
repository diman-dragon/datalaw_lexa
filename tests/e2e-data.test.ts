import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SHARDS, shardName, shardOf } from '../src/lib/hash.ts';
import { normalizeEn, normalizeRu } from '../src/lib/text.ts';
import { hasWord, parseWordList, prefixSearch } from '../src/lib/search.ts';
import type { Entry, Meta, SentencePair } from '../src/lib/types.ts';

/** Сквозная проверка: Python собирает образец, TypeScript находит данные теми же шардами. */
let dir = '';

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'lexa-data-'));
  execFileSync('python3', ['scripts/build_data.py', '--sample', '--out', dir], { stdio: 'ignore' });
});
after(() => rmSync(dir, { recursive: true, force: true }));

const read = <T>(folder: 'e' | 'r' | 's', key: string): Record<string, T> =>
  JSON.parse(readFileSync(join(dir, folder, `${shardName(shardOf(key, SHARDS[folder]))}.json`), 'utf8')) as Record<string, T>;

test('meta и список слов', () => {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Meta;
  assert.equal(meta.words, 9);
  const ix = parseWordList(readFileSync(join(dir, 'words.txt'), 'utf8'));
  assert.ok(hasWord(ix, 'hello'));
  assert.equal(prefixSearch(ix, 'h').map((h) => h.key)[0], 'house');
});

test('поиск английского слова по нормализованному ключу', () => {
  const key = normalizeEn('  Hello! ');
  const e = read<Entry>('e', key)[key];
  assert.equal(e?.w, 'hello');
  assert.equal(e?.m?.[0]?.t, 'interjection');
  assert.equal(read<Entry>('e', 'ran')['ran']?.r?.[0], 'run');
});

test('обратный поиск по русскому слову (ё, ударения, регистр)', () => {
  const key = normalizeRu('Моро́женое');
  assert.deepEqual(read<string[]>('r', key)[key], ['ice cream']);
});

test('предложения', () => {
  const s = read<SentencePair[]>('s', 'house')['house'];
  assert.equal(s?.[0]?.[1], 'Они купили красивый дом у моря.');
});
