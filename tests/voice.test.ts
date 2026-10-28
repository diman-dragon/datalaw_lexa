import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceError, cleanAlternatives, pickAlternative, setNativeVoice, startVoice, voiceLocale } from '../src/lib/voice.ts';
import type { NativeVoice, VoiceHandlers } from '../src/lib/voice.ts';

type G = Record<string, unknown>;
const g = globalThis as unknown as G;

afterEach(() => {
  setNativeVoice(null);
  delete g.SpeechRecognition;
  delete g.webkitSpeechRecognition;
});

/** Собирает всё, что пришло в обработчики. */
function recorder() {
  const log: string[] = [];
  let error: VoiceError | null = null;
  let final: string[] | null = null;
  const handlers: VoiceHandlers = {
    onPhase: (p) => log.push(`phase:${p}`),
    onLevel: (l) => log.push(`level:${l}`),
    onPartial: (t) => log.push(`partial:${t}`),
    onFinal: (a) => {
      final = a;
      log.push('final');
    },
    onError: (e) => {
      error = e;
      log.push(`error:${e.kind}`);
    },
  };
  return { handlers, log, error: () => error, final: () => final };
}

function fakeNative(opts: { startError?: unknown } = {}) {
  const listeners = new Map<string, (d: Record<string, unknown>) => void>();
  const removed: string[] = [];
  const calls: string[] = [];
  const impl: NativeVoice = {
    available: async () => ({ value: true }),
    async start(o) {
      calls.push(`start:${o.lang}:${o.preferOffline}`);
      if (opts.startError) throw opts.startError;
    },
    async stop() {
      calls.push('stop');
    },
    async cancel() {
      calls.push('cancel');
    },
    async addListener(event, cb) {
      listeners.set(event, cb);
      return { remove: async () => void removed.push(event) };
    },
  };
  setNativeVoice(impl);
  return { emit: (event: string, data: Record<string, unknown>) => listeners.get(event)?.(data), removed, calls };
}

test('native: фазы, уровень, промежуточный и итоговый результат', async () => {
  const n = fakeNative();
  const r = recorder();
  await startVoice('en-US', r.handlers);
  assert.deepEqual(n.calls, ['start:en-US:true']);

  n.emit('state', { phase: 'listening' });
  n.emit('level', { value: 0.4 });
  n.emit('level', { value: 7 }); // вне диапазона — обрезается до 1
  n.emit('partial', { text: ' hel ' });
  n.emit('state', { phase: 'processing' });
  n.emit('final', { alternatives: ['hello', 'hallo'] });

  assert.deepEqual(r.log, ['phase:listening', 'level:0.4', 'level:1', 'partial:hel', 'phase:processing', 'final']);
  assert.deepEqual(r.final(), ['hello', 'hallo']);
  assert.equal(n.removed.length, 5, 'после результата слушатели сняты');
});

test('native: после итога поздние события игнорируются', async () => {
  const n = fakeNative();
  const r = recorder();
  await startVoice('en-US', r.handlers);
  n.emit('final', { alternatives: ['one'] });
  n.emit('partial', { text: 'late' });
  n.emit('error', { code: 'NO_SPEECH' });
  assert.deepEqual(r.log, ['final']);
});

test('native: коды ошибок → виды ошибок', async () => {
  const cases: Array<[string, string]> = [
    ['PERMISSION', 'permission'],
    ['NETWORK', 'network'],
    ['NO_SPEECH', 'no-speech'],
    ['LANG', 'lang'],
    ['BUSY', 'busy'],
    ['UNAVAILABLE', 'unavailable'],
    ['WAT', 'failed'],
  ];
  for (const [code, kind] of cases) {
    const n = fakeNative();
    const r = recorder();
    await startVoice('ru-RU', r.handlers);
    n.emit('error', { code });
    assert.equal(r.error()?.kind, kind, code);
  }
});

test('native: отказ start() (нет плагина / нет разрешения) → onError, а не исключение', async () => {
  fakeNative({ startError: { code: 'UNIMPLEMENTED' } });
  const r = recorder();
  await startVoice('en-US', r.handlers);
  assert.equal(r.error()?.kind, 'unavailable');

  fakeNative({ startError: { code: 'PERMISSION' } });
  const r2 = recorder();
  await startVoice('en-US', r2.handlers);
  assert.equal(r2.error()?.kind, 'permission');
});

test('native: итог без вариантов = «не расслышал»', async () => {
  const n = fakeNative();
  const r = recorder();
  await startVoice('en-US', r.handlers);
  n.emit('final', { alternatives: [] });
  assert.equal(r.error()?.kind, 'no-speech');
});

test('native: stop() и cancel()', async () => {
  const n = fakeNative();
  const r = recorder();
  const s = await startVoice('en-US', r.handlers);
  s.stop();
  s.cancel();
  s.cancel(); // повторный — без эффекта
  await Promise.resolve();
  assert.deepEqual(n.calls, ['start:en-US:true', 'stop', 'cancel']);
  n.emit('final', { alternatives: ['x'] });
  assert.equal(r.final(), null, 'после cancel результат не приходит');
});

class FakeRec {
  static last: FakeRec;
  lang = '';
  interimResults = false;
  continuous = true;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  aborted = false;
  constructor() {
    FakeRec.last = this;
  }
  start() {
    queueMicrotask(() => this.onstart?.());
  }
  stop() {}
  abort() {
    this.aborted = true;
  }
}

const result = (isFinal: boolean, ...texts: string[]) => ({
  results: [Object.assign(texts.map((transcript) => ({ transcript })), { isFinal })],
});

test('web: промежуточные и итоговые результаты', async () => {
  g.webkitSpeechRecognition = FakeRec;
  const r = recorder();
  await startVoice('en-GB', r.handlers);
  const rec = FakeRec.last;
  assert.equal(rec.lang, 'en-GB');
  assert.equal(rec.interimResults, true);
  assert.equal(rec.continuous, false);

  await Promise.resolve();
  rec.onresult?.(result(false, 'wor'));
  rec.onspeechend?.();
  rec.onresult?.(result(true, 'word', 'ward'));
  rec.onend?.(); // после итога — не ошибка

  assert.deepEqual(r.log, ['phase:listening', 'level:0.7', 'partial:wor', 'phase:processing', 'final']);
  assert.deepEqual(r.final(), ['word', 'ward']);
});

test('web: ошибки и конец без результата', async () => {
  g.SpeechRecognition = FakeRec;
  const r = recorder();
  await startVoice('en-US', r.handlers);
  FakeRec.last.onerror?.({ error: 'not-allowed' });
  assert.equal(r.error()?.kind, 'permission');

  const r2 = recorder();
  await startVoice('en-US', r2.handlers);
  FakeRec.last.onend?.();
  assert.equal(r2.error()?.kind, 'no-speech');
});

test('web: cancel не вызывает ошибок', async () => {
  g.SpeechRecognition = FakeRec;
  const r = recorder();
  const s = await startVoice('en-US', r.handlers);
  s.cancel();
  FakeRec.last.onerror?.({ error: 'aborted' });
  FakeRec.last.onend?.();
  assert.ok(FakeRec.last.aborted);
  assert.equal(r.error(), null);
});

test('нет ни нативного, ни web распознавателя → unavailable', async () => {
  const r = recorder();
  await startVoice('en-US', r.handlers);
  assert.equal(r.error()?.kind, 'unavailable');
});

test('voiceLocale', () => {
  assert.equal(voiceLocale('ru'), 'ru-RU');
  assert.equal(voiceLocale('en'), 'en-US');
  assert.equal(voiceLocale('en', 'uk'), 'en-GB');
});

test('cleanAlternatives: регистр, знаки, дубли, ё, лимит', () => {
  assert.deepEqual(cleanAlternatives(['Hello.', 'hello', ' HELLO! ', 'Hallo'], 'en'), ['hello', 'hallo']);
  assert.deepEqual(cleanAlternatives(['Ёжик', 'ежик'], 'ru'), ['ежик']);
  assert.deepEqual(cleanAlternatives(['', '  ', '.'], 'en'), []);
  assert.equal(cleanAlternatives(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'en').length, 5);
});

test('pickAlternative: предпочитает слово из словаря', () => {
  const dict = new Set(['ward']);
  assert.deepEqual(pickAlternative(['word', 'ward'], (k) => dict.has(k)), { text: 'ward', exact: true });
  assert.deepEqual(pickAlternative(['word', 'wurd'], (k) => dict.has(k)), { text: 'word', exact: false });
  assert.equal(pickAlternative([], () => true), null);
});
