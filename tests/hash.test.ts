import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a, shardName, shardOf } from '../src/lib/hash.ts';

// Золотые значения посчитаны Python-пайплайном (scripts/build_data.py) — шардирование обязано совпадать.
test('fnv1a совпадает с Python', () => {
  assert.equal(fnv1a(''), 2166136261);
  assert.equal(fnv1a('hello'), 1335831723);
  assert.equal(fnv1a('run'), 718098122);
  assert.equal(fnv1a('café'), 2821410889);
  assert.equal(fnv1a('привет'), 2168984447);
  assert.equal(fnv1a('ice cream'), 1867717406);
});

test('shardOf / shardName', () => {
  assert.equal(shardOf('hello', 512), 171);
  assert.equal(shardOf('привет', 128), 127);
  assert.equal(shardOf('привет', 512), 383);
  assert.equal(shardName(7), '007');
});
