import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSeries, last } from '../assets/js/app/series.js';

const history = [
  { t: 100, requests: 0, inflight: 1, p95_ms: 2, p99_ms: 3 },
  { t: 105, requests: 50, inflight: 2, p95_ms: 4, p99_ms: 6 },
  { t: 110, requests: 50, inflight: 0, p95_ms: 1, p99_ms: 2 },
];

test('rps is the per-second delta between samples', () => {
  assert.deepEqual(deriveSeries(history).rps, [{ t: 105, v: 10 }, { t: 110, v: 0 }]);
});
test('a counter reset never produces negative throughput', () => {
  const rps = deriveSeries([{ t: 1, requests: 100 }, { t: 2, requests: 5 }]).rps;
  assert.equal(rps[0].v, 0);
});
test('other series map 1:1', () => {
  const s = deriveSeries(history);
  assert.equal(s.inflight.length, 3);
  assert.deepEqual(s.p95.map((p) => p.v), [2, 4, 1]);
});
test('empty history is safe', () => {
  assert.deepEqual(deriveSeries().rps, []);
  assert.equal(last([]), 0);
});
