import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOverview } from '../assets/js/app/overview.js';
import { overviewStore } from '../assets/js/app/state.js';

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
  overviewStore.set({ data: null, at: 0, error: null });
});

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

test('concurrent callers share one request', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return okResponse({ version: 'x', databases: [] });
  };
  const [a, b, c] = await Promise.all([fetchOverview(), fetchOverview(), fetchOverview()]);
  assert.equal(calls, 1, 'first paint, the view and the poller must not each hit the server');
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(overviewStore.get().error, null);
});

test('a new request is made once the previous one has settled', async () => {
  let calls = 0;
  globalThis.fetch = async () => (calls++, okResponse({ n: calls }));
  await fetchOverview();
  await fetchOverview();
  assert.equal(calls, 2);
});

test('a failure keeps the last good data and records the error', async () => {
  globalThis.fetch = async () => okResponse({ n: 1 });
  await fetchOverview();
  globalThis.fetch = async () => ({ ok: false, status: 504, json: async () => ({ error: { message: 'engine busy' } }) });
  await assert.rejects(fetchOverview(), /engine busy/);
  const s = overviewStore.get();
  assert.deepEqual(s.data, { n: 1 }, 'stale data must survive a failed refresh');
  assert.equal(s.error, 'engine busy');
});

test('a failed request does not wedge later ones', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(fetchOverview());
  globalThis.fetch = async () => okResponse({ n: 2 });
  assert.deepEqual(await fetchOverview(), { n: 2 });
});

test('force abandons a hung request and starts a fresh one', async () => {
  let calls = 0;
  globalThis.fetch = (_url, { signal }) => {
    calls++;
    if (calls === 1) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return Promise.resolve(okResponse({ n: 'fresh' }));
  };
  const hung = fetchOverview();
  hung.catch(() => {}); // the abandoned one rejects; we only care that it does not poison the store
  const fresh = await fetchOverview({ force: true });
  assert.deepEqual(fresh, { n: 'fresh' });
  assert.equal(calls, 2);
  await assert.rejects(hung, (e) => e.superseded === true);
  assert.equal(overviewStore.get().error, null, 'an abandoned request must not be reported as a server failure');
  assert.deepEqual(overviewStore.get().data, { n: 'fresh' });
});
