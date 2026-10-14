import test from 'node:test';
import assert from 'node:assert/strict';
import { nf, compact, bytes, duration, ms, timestamp, niceMax, epochToIso } from '../assets/js/core/format.js';

test('nf formats with grouping and handles null', () => {
  assert.equal(nf(1234567), '1,234,567');
  assert.equal(nf(null), '—');
});
test('compact abbreviates large counts', () => {
  assert.equal(compact(999), '999');
  assert.equal(compact(12400), '12.4k');
  assert.equal(compact(3_500_000), '3.5M');
});
test('bytes picks the right unit', () => {
  assert.equal(bytes(0), '0 B');
  assert.equal(bytes(1536), '1.5 KB');
  assert.equal(bytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(bytes(null), '—');
});
test('duration', () => {
  assert.equal(duration(12), '12s');
  assert.equal(duration(125), '2m 5s');
  assert.equal(duration(3 * 3600 + 5 * 60), '3h 5m');
  assert.equal(duration(2 * 86400 + 3 * 3600), '2d 3h');
});
test('ms adapts precision', () => {
  assert.equal(ms(0.5), '0.50 ms');
  assert.equal(ms(25), '25.0 ms');
  assert.equal(ms(250.4), '250 ms');
});
test('timestamp trims ISO to seconds', () => {
  assert.equal(timestamp('2026-10-14T08:40:36.123Z'), '2026-10-14 08:40:36');
});
test('niceMax rounds up to 1/2/5 steps', () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(0.7), 1);
  assert.equal(niceMax(1.4), 2);
  assert.equal(niceMax(3.2), 5);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(130), 200);
});
test('epochToIso', () => {
  assert.equal(epochToIso(0), '1970-01-01 00:00:00');
  assert.equal(epochToIso('nope'), 'nope');
});
