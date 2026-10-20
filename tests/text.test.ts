import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectScript, normalizeEn, normalizeRu } from '../src/lib/text.ts';

test('normalizeEn — как norm_en в Python', () => {
  assert.equal(normalizeEn('  “Don’t  Stop!” '), "don't stop");
  assert.equal(normalizeEn('Hello,'), 'hello');
  assert.equal(normalizeEn('CAFÉ'), 'café');
});

test('normalizeRu — как norm_ru в Python', () => {
  assert.equal(normalizeRu('  Моро́женое, '), 'мороженое');
  assert.equal(normalizeRu('Ёж'), 'еж');
  assert.equal(normalizeRu('ПРИВЕТ!'), 'привет');
});

test('detectScript', () => {
  assert.equal(detectScript('hello'), 'latin');
  assert.equal(detectScript('café'), 'latin');
  assert.equal(detectScript('привет'), 'cyrillic');
  assert.equal(detectScript('  Ёж'), 'cyrillic');
  assert.equal(detectScript('123'), 'other');
  assert.equal(detectScript('你好'), 'other');
});
