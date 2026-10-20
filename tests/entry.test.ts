import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accentsAvailable, firstDefinition, frequencyBand, ipaFor, termText, topTranslations, wordOfTheDay, WORDS_OF_THE_DAY } from '../src/lib/entry.ts';
import type { Entry } from '../src/lib/types.ts';

const hello: Entry = {
  w: 'hello',
  z: 49,
  p: [
    ['/həˈloʊ/', 'us'],
    ['/həˈləʊ/', 'uk'],
  ],
  m: [{ t: 'interjection', s: [{ d: 'A greeting said when meeting someone, long enough to be truncated by the limit.' }] }],
  tr: [
    { g: 'greeting', t: [{ w: 'привет', x: 'm' }, 'здравствуйте', 'алло'] },
    { g: 'phone', t: ['алло', 'слушаю'] },
  ],
};

test('ipaFor / accentsAvailable', () => {
  assert.equal(ipaFor(hello, 'uk'), '/həˈləʊ/');
  assert.equal(ipaFor(hello, 'au'), '/həˈloʊ/');
  assert.deepEqual(accentsAvailable(hello), ['us', 'uk']);
  assert.equal(ipaFor({ w: 'x' }, 'us'), undefined);
});

test('firstDefinition обрезает', () => {
  assert.equal(firstDefinition(hello, 20), 'A greeting said whe…');
  assert.equal(firstDefinition(null), undefined);
});

test('topTranslations: по одному из каждого значения, без повторов', () => {
  assert.deepEqual(topTranslations(hello.tr, 4), ['привет', 'алло', 'здравствуйте', 'слушаю']);
  assert.deepEqual(topTranslations(undefined), []);
  assert.equal(termText({ w: 'дом', x: 'm' }), 'дом');
});

test('frequencyBand', () => {
  assert.equal(frequencyBand(undefined), undefined);
  assert.equal(frequencyBand(0), undefined);
  assert.equal(frequencyBand(55), 'veryCommon');
  assert.equal(frequencyBand(45), 'common');
  assert.equal(frequencyBand(33), 'uncommon');
  assert.equal(frequencyBand(20), 'rare');
});

test('wordOfTheDay детерминирован и циклически смещается', () => {
  assert.equal(wordOfTheDay(), wordOfTheDay(0));
  assert.equal(wordOfTheDay(WORDS_OF_THE_DAY.length), wordOfTheDay(0));
  assert.notEqual(wordOfTheDay(1), wordOfTheDay(0));
  assert.ok(WORDS_OF_THE_DAY.includes(wordOfTheDay(-5)));
});
