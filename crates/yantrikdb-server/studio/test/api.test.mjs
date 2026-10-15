import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, errorMessage } from '../assets/js/core/api.js';

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test('errorMessage picks the most specific message', () => {
  assert.equal(errorMessage({ error: { message: 'deep' } }, 500), 'deep');
  assert.equal(errorMessage({ message: 'flat' }, 500), 'flat');
  assert.equal(errorMessage({ error: 'str' }, 500), 'str');
  assert.equal(errorMessage({}, 502), 'HTTP 502');
  assert.equal(errorMessage(null, 503), 'HTTP 503');
});

test('a request that never answers is aborted and reported as a timeout', async () => {
  globalThis.fetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  const started = Date.now();
  await assert.rejects(
    () => api.get('/v1/admin/ops/overview', { timeoutMs: 40 }),
    (e) => e instanceof ApiError && e.timeout === true && /busy/i.test(e.message),
  );
  assert.ok(Date.now() - started < 1000, 'must fail fast, not hang');
});

test('a refused connection is a clear error, not a timeout', async () => {
  globalThis.fetch = () => Promise.reject(new TypeError('fetch failed'));
  await assert.rejects(() => api.get('/x'), (e) => e.timeout === false && /Cannot reach/.test(e.message));
});

test('HTTP errors surface the server message and status', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 504, json: async () => ({ error: { message: 'engine busy' } }) });
  await assert.rejects(() => api.get('/x'), (e) => e.status === 504 && e.message === 'engine busy');
});

test('a non-JSON success body does not throw', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 202, json: async () => { throw new Error('no body'); } });
  assert.deepEqual(await api.post('/x', {}), {});
});
